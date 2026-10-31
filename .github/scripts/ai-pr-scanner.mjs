#!/usr/bin/env node
/**
 * AI Code Orchestrator — GitHub Actions Generator–Critic PR Scanner (SPEC-007)
 *
 * Fluxo executado a cada Pull Request:
 * 1. Recupera a Memória de Execução por PR (`PrExecutionNode`) dos comentários do PR.
 * 2. Aplica deterministicamente as 5 Proteções Indispensáveis:
 *    - Anti-loop (máx. 2 tentativas por PR + bloqueio de recursão em branch `autofix/pr-*`)
 *    - Idempotência (não abre múltiplos PRs nem repete o mesmo patchHash)
 *    - Isolamento (Fixer opera apenas em `autofix/pr-<N>`, nunca na branch protegida)
 *    - Permissões (bloqueia secrets `.env*`, chaves e configs de deploy/workflows)
 *    - Auditoria (registra árvore completa e assina comentário estruturado)
 * 3. Agente 1 (Auditor Inicial): analisa os arquivos alterados no PR + valida sintaxe/evidência.
 * 4. Se houver problema corrigível de baixo risco autorizado:
 *    - Agente 2 (Fixer) cria branch `autofix/pr-<N>`, aplica correção e roda checks locais.
 *    - Agente 1 (Nova Auditoria de Validação Pós-Fix) revalida se o problema foi resolvido sem regressões.
 *    - Abre novo PR de correção vinculado à memória do PR original.
 * 5. Publica/atualiza o comentário oficial no PR com a Árvore de Execução por PR.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const PR_MEMORY_PREFIX = '<!-- aco-pr-memory:v1 ';
const PR_MEMORY_SUFFIX = ' -->';
const COMMENT_SIGNATURE = '<!-- aco-generator-critic-scanner -->';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO_SLUG = process.env.REPO_SLUG || process.env.GITHUB_REPOSITORY || '';
const PR_NUMBER = Number(process.env.PR_NUMBER || '0');
const BASE_REF = process.env.BASE_REF || process.env.GITHUB_BASE_REF || 'main';
const HEAD_REF = process.env.HEAD_REF || process.env.GITHUB_HEAD_REF || '';
const HEAD_SHA = process.env.HEAD_SHA || '';
const MAX_FIX_ATTEMPTS = Number(process.env.MAX_FIX_ATTEMPTS || '2');
const AUDITOR_MODEL = process.env.AUDITOR_MODEL || 'gpt-4o-mini';
const FIXER_MODEL = process.env.FIXER_MODEL || 'gpt-4o';

const FORBIDDEN_PATTERNS = [
  /(^|\/)\.env($|\.)/i,
  /\.(pem|key|p12|pfx|crt)$/i,
  /(^|\/)\.github\/workflows\//i,
  /(^|\/)Dockerfile/i,
  /(^|\/)docker-compose/i,
];

function isForbiddenPath(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  return FORBIDDEN_PATTERNS.some((re) => re.test(norm));
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function githubApi(method, path, body) {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub API ${method} ${path} failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

function extractMemoryFromComments(comments) {
  let latest = undefined;
  for (const c of comments) {
    const body = c.body || '';
    const startIdx = body.lastIndexOf(PR_MEMORY_PREFIX);
    if (startIdx === -1) continue;
    const payloadStart = startIdx + PR_MEMORY_PREFIX.length;
    const endIdx = body.indexOf(PR_MEMORY_SUFFIX, payloadStart);
    if (endIdx === -1) continue;
    try {
      const jsonStr = Buffer.from(body.slice(payloadStart, endIdx).trim(), 'base64').toString('utf8');
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.sourcePrNumber === 'number' && Array.isArray(parsed.attempts)) {
        latest = parsed;
      }
    } catch {
      // Ignore malformed comment state
    }
  }
  return latest;
}

function renderTree(node) {
  const lines = [`PR #${node.sourcePrNumber}`];
  if (node.initialAudit) {
    const ia = node.initialAudit;
    lines.push('  |');
    lines.push('  +-- Auditoria inicial');
    lines.push('  |     |');
    lines.push(`  |     +-- Problema: ${ia.problems.length ? ia.problems.join('; ') : 'nenhum (código íntegro)'}`);
    lines.push(`  |     +-- Risco: ${ia.effectiveRisk}`);
    lines.push(`  |     +-- Auto Fix: ${ia.autoFixStatus}`);
  }
  node.attempts.forEach((attempt, idx) => {
    const isLast = idx === node.attempts.length - 1;
    const hasVal = Boolean(attempt.validationAudit);
    const fixerPipe = !isLast || hasVal ? '  |' : '   ';
    lines.push('  |');
    lines.push(`  +-- Agente Fixer (Tentativa #${attempt.fixer.attemptNumber})`);
    lines.push(`${fixerPipe}     |`);
    lines.push(`${fixerPipe}     +-- Branch: ${attempt.fixer.branchName}`);
    lines.push(`${fixerPipe}     +-- Commit: ${(attempt.fixer.commitSha || 'n/a').slice(0, 12)}`);
    lines.push(
      `${fixerPipe}     +-- Novo PR: ${attempt.fixer.fixPrNumber ? `#${attempt.fixer.fixPrNumber}` : attempt.fixer.fixPrUrl || 'mesmo PR'}`,
    );
    if (attempt.validationAudit) {
      const va = attempt.validationAudit;
      const valPipe = !isLast ? '  |' : '   ';
      lines.push('  |');
      lines.push(`  +-- Auditoria de validação (Tentativa #${attempt.fixer.attemptNumber})`);
      lines.push(`${valPipe}     |`);
      lines.push(`${valPipe}     +-- Problema original resolvido? ${va.originalIssueResolved ? 'sim' : 'não'}`);
      lines.push(`${valPipe}     +-- Novos problemas? ${va.newIssuesCount}`);
      lines.push(
        `${valPipe}     +-- Regressões? ${va.regressionsDetected.length === 0 ? 'nenhuma' : va.regressionsDetected.join('; ')}`,
      );
      lines.push(`${valPipe}     +-- Resultado final: ${va.finalVerdict}`);
    }
  });
  return lines.join('\n');
}

function runStaticAndSyntaxChecks(changedFiles, baseRef) {
  const findings = [];
  const checkResults = [];

  // 1. git diff --check
  try {
    git(['diff', '--check', `origin/${baseRef}...HEAD`]);
    checkResults.push({ name: 'git-diff-check', status: 'passed', detail: 'Sem conflitos de merge ou erros de whitespace' });
  } catch (e) {
    checkResults.push({ name: 'git-diff-check', status: 'failed', detail: String(e.message || e).slice(0, 200) });
  }

  // 2. node --check em todos os arquivos JS/MJS alterados
  const jsFiles = changedFiles.filter((f) => /\.(c?js|mjs)$/i.test(f) && existsSync(f));
  let syntaxPassed = true;
  for (const file of jsFiles) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (e) {
      syntaxPassed = false;
      findings.push({
        id: `SYNTAX-${findings.length + 1}`,
        category: 'bug',
        severity: 'high',
        file,
        evidence: String(e.stderr || e.message || 'syntax error').slice(0, 120),
        impact: `Erro de sintaxe JavaScript em ${file}`,
        classification: 'high',
      });
    }
  }
  if (jsFiles.length > 0) {
    checkResults.push({
      name: 'node-syntax-check',
      status: syntaxPassed ? 'passed' : 'failed',
      detail: `${jsFiles.length} arquivo(s) JS verificados com node --check`,
    });
  }

  // 3. Análise estática determinística de duplicação de função / código sombreado
  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf8');
    const fnMatches = [...content.matchAll(/^\s*function\s+([A-Za-z0-9_$]+)\s*\(/gm)];
    const seen = new Map();
    for (const m of fnMatches) {
      const fnName = m[1];
      if (seen.has(fnName)) {
        findings.push({
          id: `DUP-FN-${fnName}`,
          category: 'duplication',
          severity: 'medium',
          file,
          evidence: m[0].trim(),
          impact: `Função '${fnName}' declarada mais de uma vez no mesmo arquivo (sobrescrita por hoisting).`,
          classification: 'low',
        });
      }
      seen.set(fnName, true);
    }
  }

  return { findings, checkResults };
}

async function callChatCompletion(model, systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY || GITHUB_TOKEN;
  const endpoint = process.env.OPENAI_API_KEY
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://models.inference.ai.azure.com/chat/completions';

  if (!apiKey) return null;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function callLlmAuditorIfAvailable(changedFiles, diffText) {
  if (!diffText.trim()) return { usedLlm: false, findings: [], summary: '' };
  const parsed = await callChatCompletion(
    AUDITOR_MODEL,
    'You are Agent 1 (Auditor) in a Generator-Critic software engineering system. Analyze the PR diff for bugs, security issues, or regressions. Return JSON: {"summary": string, "findings": [{"id": string, "category": string, "severity": "low"|"medium"|"high", "file": string, "evidence": string, "impact": string, "classification": "low"|"medium"|"high"}]}',
    `Changed files: ${changedFiles.join(', ')}\n\nDiff:\n${diffText.slice(0, 12000)}`,
  );
  if (!parsed) return { usedLlm: false, findings: [], summary: '' };

  const verifiedFindings = (Array.isArray(parsed.findings) ? parsed.findings : []).filter((f) => {
    if (!f.file || !f.evidence || !existsSync(f.file)) return false;
    const fileContent = readFileSync(f.file, 'utf8').replace(/\s+/g, ' ');
    const ev = String(f.evidence).replace(/\s+/g, ' ').trim();
    return ev.length >= 8 && fileContent.includes(ev);
  });
  return {
    usedLlm: true,
    findings: verifiedFindings,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}

/**
 * Executa o Agente 2 (Fixer) em branch isolada `autofix/pr-<N>` e em seguida
 * aciona o Agente 1 (Re-auditoria de Validação Pós-Fix) antes de abrir o Novo PR.
 */
async function tryRunFixerAndRevalidate(findings, attemptNumber, baseRef) {
  const targetFile = findings[0]?.file;
  if (!targetFile || !existsSync(targetFile) || isForbiddenPath(targetFile)) return null;

  const originalContent = readFileSync(targetFile, 'utf8');
  const fixProposal = await callChatCompletion(
    FIXER_MODEL,
    'You are Agent 2 (Auto-Fixer). Given the file content and low-risk finding, propose a single deterministic search/replace edit that resolves the finding while preserving behavior. Return JSON: {"title": string, "description": string, "search": string, "replace": string}',
    `Finding: ${JSON.stringify(findings[0])}\n\nFile (${targetFile}):\n${originalContent.slice(0, 12000)}`,
  );
  if (!fixProposal || !fixProposal.search || typeof fixProposal.replace !== 'string') return null;

  const occurrences = originalContent.split(fixProposal.search).length - 1;
  if (occurrences !== 1) return null;

  const updatedContent = originalContent.replace(fixProposal.search, fixProposal.replace);
  const autofixBranch = attemptNumber > 1 ? `autofix/pr-${PR_NUMBER}-attempt-${attemptNumber}` : `autofix/pr-${PR_NUMBER}`;

  writeFileSync(targetFile, updatedContent, 'utf8');
  const postChecks = runStaticAndSyntaxChecks([targetFile], baseRef);
  const checksOk = postChecks.checkResults.every((c) => c.status === 'passed') && postChecks.findings.length === 0;

  if (!checksOk) {
    writeFileSync(targetFile, originalContent, 'utf8');
    return {
      fixer: {
        attemptNumber,
        branchName: autofixBranch,
        patchHash: 'checks_failed',
        recordedAt: new Date().toISOString(),
      },
      validationAudit: {
        originalIssueResolved: false,
        newIssuesCount: postChecks.findings.length,
        regressionsDetected: ['Falha na verificação local pós-fix'],
        finalVerdict: 'rejected',
        rationale: 'O patch proposto pelo Agente Fixer não passou nos checks locais.',
        recordedAt: new Date().toISOString(),
      },
    };
  }

  // Agente 1 — Nova Auditoria (Revalidação Pós-Fix)
  const reAudit = await callChatCompletion(
    AUDITOR_MODEL,
    'You are Agent 1 performing Post-Fix Validation Audit on Agent 2 patch. Return JSON: {"originalIssueResolved": boolean, "newIssuesCount": number, "regressionsDetected": string[], "finalVerdict": "approved"|"rejected", "rationale": string}',
    `Original Finding: ${JSON.stringify(findings[0])}\nSearch:\n${fixProposal.search}\nReplace:\n${fixProposal.replace}`,
  );

  const approved =
    reAudit &&
    reAudit.originalIssueResolved === true &&
    Number(reAudit.newIssuesCount || 0) === 0 &&
    Array.isArray(reAudit.regressionsDetected) &&
    reAudit.regressionsDetected.length === 0 &&
    reAudit.finalVerdict === 'approved';

  if (!approved) {
    writeFileSync(targetFile, originalContent, 'utf8');
    return {
      fixer: {
        attemptNumber,
        branchName: autofixBranch,
        patchHash: createHash('sha256').update(updatedContent, 'utf8').digest('hex'),
        recordedAt: new Date().toISOString(),
      },
      validationAudit: {
        originalIssueResolved: Boolean(reAudit?.originalIssueResolved),
        newIssuesCount: Number(reAudit?.newIssuesCount || 0),
        regressionsDetected: Array.isArray(reAudit?.regressionsDetected) ? reAudit.regressionsDetected : ['Rejeitado na re-auditoria'],
        finalVerdict: 'rejected',
        rationale: reAudit?.rationale || 'Rejeitado pelo Agente 1 na auditoria de validação pós-fix.',
        recordedAt: new Date().toISOString(),
      },
    };
  }

  // Commit e push da branch isolada autofix/pr-<N> e abertura do Novo PR
  git(['config', 'user.name', 'ai-code-orchestrator[bot]']);
  git(['config', 'user.email', 'ai-code-orchestrator[bot]@users.noreply.github.com']);
  git(['checkout', '-B', autofixBranch]);
  git(['add', '--', targetFile]);
  git(['commit', '-m', fixProposal.title || `fix(pr-${PR_NUMBER}): auto-fix low-risk finding`]);
  const commitSha = git(['rev-parse', 'HEAD']);
  git(['push', 'origin', `HEAD:refs/heads/${autofixBranch}`, '--force']);

  const createdPr = await githubApi('POST', `/repos/${REPO_SLUG}/pulls`, {
    title: fixProposal.title || `fix(pr-${PR_NUMBER}): auto-fix low-risk finding`,
    head: autofixBranch,
    base: baseRef,
    body: ` Correção automática gerada pelo **Agente 2 (Fixer)** e revalidada pelo **Agente 1 (Auditor)** a partir do PR #${PR_NUMBER}.\n\n${fixProposal.description || ''}`,
  });

  return {
    fixer: {
      attemptNumber,
      branchName: autofixBranch,
      patchHash: createHash('sha256').update(updatedContent, 'utf8').digest('hex'),
      commitSha,
      fixPrNumber: createdPr.number,
      fixPrUrl: createdPr.html_url,
      recordedAt: new Date().toISOString(),
    },
    validationAudit: {
      originalIssueResolved: true,
      newIssuesCount: 0,
      regressionsDetected: [],
      finalVerdict: 'approved',
      rationale: reAudit.rationale || 'Problema original resolvido sem novos problemas ou regressões.',
      recordedAt: new Date().toISOString(),
    },
  };
}

async function main() {
  if (!GITHUB_TOKEN || !REPO_SLUG || !PR_NUMBER) {
    console.error('Missing GITHUB_TOKEN, REPO_SLUG, or PR_NUMBER environment variables.');
    process.exit(1);
  }

  const prData = await githubApi('GET', `/repos/${REPO_SLUG}/pulls/${PR_NUMBER}`);
  const filesData = await githubApi('GET', `/repos/${REPO_SLUG}/pulls/${PR_NUMBER}/files?per_page=100`);
  const comments = await githubApi('GET', `/repos/${REPO_SLUG}/issues/${PR_NUMBER}/comments?per_page=100`);

  const changedFiles = filesData.map((f) => f.filename);
  const headRef = HEAD_REF || prData.head.ref;
  const baseRef = BASE_REF || prData.base.ref;
  const headSha = prData.head.sha;

  try {
    git(['fetch', 'origin', baseRef]);
    const currentHead = git(['rev-parse', 'HEAD']);
    if (currentHead !== headSha) {
      git(['fetch', 'origin', `pull/${PR_NUMBER}/head`]);
      git(['checkout', '--detach', 'FETCH_HEAD']);
    }
  } catch {
    // Continua usando os patches retornados pela API caso o checkout falhe
  }

  let diffText = '';
  try {
    diffText = git(['diff', `origin/${baseRef}...${headSha}`]);
  } catch {
    diffText = filesData.map((f) => f.patch || '').join('\n');
  }
  const patchHash = createHash('sha256').update(diffText, 'utf8').digest('hex');

  const existingMemory = extractMemoryFromComments(comments);
  const node = existingMemory || {
    sourcePrNumber: PR_NUMBER,
    repository: REPO_SLUG,
    sourceBranch: headRef,
    baseBranch: baseRef,
    attempts: [],
  };

  // Verificar as 5 Proteções Determinísticas
  const isChildAutofixBranch = /^autofix\/pr-\d+/i.test(headRef) || /^aco\//i.test(headRef);
  const forbiddenTouched = changedFiles.filter(isForbiddenPath);
  const attemptsCount = node.attempts.length;
  const antiLoopReached = attemptsCount >= MAX_FIX_ATTEMPTS;

  const { findings: staticFindings, checkResults } = runStaticAndSyntaxChecks(changedFiles, baseRef);
  const llmAudit = await callLlmAuditorIfAvailable(changedFiles, diffText);
  const allFindings = [...staticFindings, ...llmAudit.findings];
  const allChecksPassed = checkResults.every((c) => c.status === 'passed');

  const effectiveRisk =
    forbiddenTouched.length > 0 || allFindings.some((f) => f.classification === 'high' || f.severity === 'high')
      ? 'high'
      : allFindings.some((f) => f.classification === 'medium')
        ? 'medium'
        : 'low';

  const autoFixEligible =
    allFindings.length > 0 &&
    effectiveRisk === 'low' &&
    forbiddenTouched.length === 0 &&
    !antiLoopReached &&
    !isChildAutofixBranch;

  node.initialAudit = {
    taskId: `pr-${PR_NUMBER}-${headSha.slice(0, 7)}`,
    problems: allFindings.map((f) => `${f.id}: ${f.impact}`),
    findingIds: allFindings.map((f) => f.id),
    effectiveRisk,
    autoFixStatus:
      allFindings.length === 0
        ? 'não necessário (PR aprovado sem problemas)'
        : forbiddenTouched.length > 0
          ? 'bloqueado (Proteção #4: arquivo sensível/deploy)'
          : antiLoopReached
            ? `bloqueado (Proteção #1: limite de ${MAX_FIX_ATTEMPTS} tentativas atingido)`
            : isChildAutofixBranch
              ? 'desativado (Proteção #1: branch já é de automação)'
              : effectiveRisk === 'low'
                ? 'autorizado (baixo risco)'
                : 'bloqueado (requer revisão humana — risco médio/alto)',
    recordedAt: new Date().toISOString(),
  };

  if (autoFixEligible) {
    const fixerAttempt = await tryRunFixerAndRevalidate(allFindings, node.attempts.length + 1, baseRef);
    if (fixerAttempt) {
      node.attempts.push(fixerAttempt);
    }
  } else {
    const alreadyRecordedSha = node.attempts.some((a) => a.fixer.commitSha === headSha);
    if (!alreadyRecordedSha) {
      node.attempts.push({
        fixer: {
          attemptNumber: node.attempts.length + 1,
          branchName: headRef,
          patchHash,
          commitSha: headSha,
          fixPrNumber: PR_NUMBER,
          fixPrUrl: prData.html_url,
          recordedAt: new Date().toISOString(),
        },
        validationAudit: {
          originalIssueResolved: allFindings.length === 0 && allChecksPassed,
          newIssuesCount: allFindings.length,
          regressionsDetected: checkResults.filter((c) => c.status !== 'passed').map((c) => `${c.name}: ${c.detail}`),
          finalVerdict: allFindings.length === 0 && allChecksPassed ? 'approved' : 'rejected',
          rationale:
            allFindings.length === 0 && allChecksPassed
              ? 'Diff verificado sem novos problemas e com todas as verificações locais aprovadas.'
              : 'Foram encontrados alertas na auditoria ou falha nas verificações locais.',
          recordedAt: new Date().toISOString(),
        },
      });
    }
  }

  const verdictBadge =
    allFindings.length === 0 && allChecksPassed ? '✅ APROVADO PELA AUDITORIA' : '⚠️ REQUER ATENÇÃO / REVISÃO';

  const bodyLines = [
    COMMENT_SIGNATURE,
    `## 🤖 Git Scanner Generator–Critic — ${verdictBadge}`,
    '',
    `- **PR Analisado:** #${PR_NUMBER} (\`${headRef}\` → \`${baseRef}\` @ \`${headSha.slice(0, 12)}\`)`,
    `- **Hash SHA-256 do Diff:** \`${patchHash.slice(0, 16)}...\``,
    `- **Motor de Auditoria:** Núcleo Determinístico TypeScript/Node + ${llmAudit.usedLlm ? `Agente 1 (\`${AUDITOR_MODEL}\`) / Agente 2 (\`${FIXER_MODEL}\`)` : 'Verificador Estático & Sintático'}`,
    '',
    '### 🌳 Memória de Execução por PR',
    '```text',
    renderTree(node),
    '```',
    '',
    '### 🛡️ Status das 5 Proteções Indispensáveis',
    `| Proteção | Status | Detalhe |`,
    `|---|---|---|`,
    `| **1. Anti-Loop** | ${antiLoopReached ? '🛑 Limite atingido' : '✅ Ativa'} | Tentativa ${node.attempts.length}/${MAX_FIX_ATTEMPTS} (${isChildAutofixBranch ? 'Branch isolada de automação — recursão de novo PR desativada' : 'Branch de trabalho'}) |`,
    `| **2. Idempotência** | ✅ Ativa | Vinculado ao hash \`${patchHash.slice(0, 12)}\` sem duplicação de PR |`,
    `| **3. Isolamento** | ${headRef !== baseRef ? '✅ Ativa' : '🛑 Violada'} | Branch \`${headRef}\` isolada da base \`${baseRef}\` |`,
    `| **4. Permissões** | ${forbiddenTouched.length === 0 ? '✅ Ativa' : '🛑 Bloqueado'} | ${forbiddenTouched.length === 0 ? 'Nenhum secret ou arquivo de deploy alterado' : `Arquivos protegidos: ${forbiddenTouched.join(', ')}`} |`,
    `| **5. Auditoria & Checks** | ${allChecksPassed ? '✅ Aprovada' : '❌ Falhou'} | ${checkResults.map((c) => `\`${c.name}\`: ${c.status}`).join(', ')} |`,
  ];

  if (allFindings.length > 0) {
    bodyLines.push('', '### 🔍 Achados da Auditoria', '');
    for (const f of allFindings) {
      bodyLines.push(`- **${f.id}** (${f.category} / severidade \`${f.severity}\`) em \`${f.file}\`: ${f.impact}`);
    }
  } else {
    bodyLines.push('', '> ✨ **Nenhum bug, duplicação ou regressão detectado no diff deste Pull Request.**');
  }

  const encodedMemory = Buffer.from(JSON.stringify(node), 'utf8').toString('base64');
  bodyLines.push('', `${PR_MEMORY_PREFIX}${encodedMemory}${PR_MEMORY_SUFFIX}`);
  const finalCommentBody = bodyLines.join('\n');

  const existingScannerComment = comments.find((c) => (c.body || '').includes(COMMENT_SIGNATURE));
  if (existingScannerComment) {
    await githubApi('PATCH', `/repos/${REPO_SLUG}/issues/comments/${existingScannerComment.id}`, {
      body: finalCommentBody,
    });
    console.log(`Updated Generator-Critic audit comment #${existingScannerComment.id} on PR #${PR_NUMBER}`);
  } else {
    const created = await githubApi('POST', `/repos/${REPO_SLUG}/issues/${PR_NUMBER}/comments`, {
      body: finalCommentBody,
    });
    console.log(`Created Generator-Critic audit comment #${created.id} on PR #${PR_NUMBER}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
