#!/usr/bin/env node
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'

/**
 * Lanes: one task, one branch, one worktree, one PR.
 *
 * Two agents in one working tree is the failure this exists to prevent — it has
 * already cost this project a broken typecheck and a file edited from both sides
 * at once. A lane is a git worktree beside the repo, so two sessions can build,
 * test and commit at the same time without seeing each other's half-finished
 * files. `main` is never worked in; it is only merged into.
 *
 *   npm run lane <task>     open a lane and print how to enter it
 *   npm run lanes           what every lane is doing right now
 *   npm run land            rebase, verify, push, open the PR, merge when CI is green
 *   npm run lane:done <task>  after it merges: remove the worktree and the branch
 *
 * The `hook ...` subcommands are wired to Claude Code in .claude/settings.json;
 * they are what makes the above automatic rather than remembered.
 */

const MAIN = 'main'
const REMOTE = 'origin'

/** Files everything routes through. Two lanes editing these at once is the one
 *  guaranteed conflict, so they are called out as they are touched. */
const CONTENDED = [
  'src/lib/engine.ts',
  'src/lib/synth.ts',
  'src/lib/chords.ts',
  'src/components/GestureSynth.tsx',
  'src/hooks/useGestureSynth.ts',
]

/** Too big or too generated to copy per lane; symlinked from the main checkout. */
const LINKED = ['node_modules', 'public/mediapipe']

const run = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const quiet = (cmd, cwd) => {
  try {
    return run(cmd, cwd)
  } catch {
    return null
  }
}
const loud = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

const gitDir = () => path.resolve(run('git rev-parse --absolute-git-dir'))
const commonDir = () => path.resolve(run('git rev-parse --git-common-dir'))
const root = () => run('git rev-parse --show-toplevel')
/** The main checkout, wherever we are called from. */
const home = () => path.dirname(commonDir())
const branchNow = () => run('git rev-parse --abbrev-ref HEAD')
const inLane = () => gitDir() !== commonDir()
const dirty = (cwd) => (quiet('git status --porcelain', cwd) ?? '').split('\n').filter(Boolean).length
const laneRoot = () => path.resolve(home(), '..', `${path.basename(home())}-wt`)

const die = (message) => {
  console.error(`\n  ${message}\n`)
  process.exit(1)
}

/** Repo-local, so it applies to every worktree at once. */
function ensureHooks() {
  if (quiet('git config core.hooksPath') !== '.githooks') {
    quiet('git config core.hooksPath .githooks')
  }
}

function open(name) {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) die('Usage: npm run lane <kebab-case-task>')
  const where = path.join(laneRoot(), name)
  if (existsSync(where)) die(`${where} already exists — enter it, or npm run lane:done ${name}`)

  ensureHooks()
  console.log(`\n  fetching ${REMOTE}…`)
  quiet(`git fetch ${REMOTE} --quiet`)

  // Always from the shared main, never from whatever this tree happens to be on.
  const base = quiet(`git rev-parse --verify ${REMOTE}/${MAIN}`) ? `${REMOTE}/${MAIN}` : MAIN
  const exists = quiet(`git rev-parse --verify refs/heads/${name}`)
  loud(`git worktree add ${exists ? '' : '-b ' + name} ${JSON.stringify(where)} ${exists ? name : base}`)

  for (const dir of LINKED) {
    const from = path.join(home(), dir)
    const to = path.join(where, dir)
    if (!existsSync(from) || existsSync(to)) continue
    mkdirSync(path.dirname(to), { recursive: true })
    symlinkSync(from, to)
    // A symlink is a file, so a .gitignore rule written with a trailing slash
    // does not cover it — and the first lane committed both of these before
    // anyone noticed. Check rather than trust.
    if (quiet(`git check-ignore -q ${JSON.stringify(to)}`, where) === null) {
      console.error(`\n  WARNING: ${dir} is not ignored in this lane. Add it to .gitignore without a trailing slash.`)
    }
  }

  console.log(`
  Lane ready, branched from ${base}.

    cd ${path.relative(process.cwd(), where)}

  ${LINKED.join(' and ')} are symlinked from the main checkout, so there is
  nothing to install. When it is done: npm run land
`)
}

function list() {
  const worktrees = run('git worktree list --porcelain')
    .split('\n\n')
    .map((block) => Object.fromEntries(block.split('\n').filter(Boolean).map((l) => [l.split(' ')[0], l.split(' ').slice(1).join(' ')])))
    .filter((w) => w.worktree)

  const prs = new Map()
  const raw = quiet('gh pr list --state open --json number,headRefName,url --limit 50')
  if (raw) for (const pr of JSON.parse(raw)) prs.set(pr.headRefName, pr)

  console.log('\n  lane                 branch               state')
  console.log('  ' + '-'.repeat(64))
  for (const tree of worktrees) {
    const dir = tree.worktree
    const branch = (tree.branch ?? '(detached)').replace('refs/heads/', '')
    const changes = dirty(dir)
    const counts = quiet(`git rev-list --left-right --count ${REMOTE}/${MAIN}...HEAD`, dir)
    const [behind, ahead] = (counts ?? '0\t0').split('\t').map(Number)
    const pr = prs.get(branch)

    const state = [
      ahead ? `${ahead} ahead` : null,
      behind ? `${behind} behind` : null,
      changes ? `${changes} uncommitted` : null,
      pr ? `PR #${pr.number}` : null,
      !ahead && !behind && !changes ? 'clean' : null,
    ]
      .filter(Boolean)
      .join(' · ')

    const label = dir === home() ? '(main checkout)' : path.basename(dir)
    console.log(`  ${label.padEnd(20)} ${branch.padEnd(20)} ${state}`)
  }
  console.log('')
}

function land(args) {
  if (!inLane()) die('Not in a lane. Work happens in lanes: npm run lane <task>')
  const branch = branchNow()
  if (branch === MAIN) die('This lane is on main. Lanes have their own branch.')

  const message = args.includes('-m') ? args[args.indexOf('-m') + 1] : null
  if (dirty(undefined)) {
    if (!message) die('Uncommitted changes. Commit them, or: npm run land -- -m "what this does"')
    loud('git add -A')
    execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' })
  }

  console.log('\n  rebasing onto the current main…')
  quiet(`git fetch ${REMOTE} --quiet`)
  try {
    run(`git rebase ${REMOTE}/${MAIN}`)
  } catch {
    die(`Rebase onto ${REMOTE}/${MAIN} hit a conflict. Resolve it, git rebase --continue, then npm run land again.`)
  }

  console.log('  verifying…\n')
  try {
    loud('npm run verify')
  } catch {
    die('verify failed. main stays green: fix it here, then land.')
  }

  console.log('\n  pushing…')
  loud(`git push -u ${REMOTE} ${branch}`)

  let url = quiet('gh pr view --json url -q .url')
  if (!url) {
    console.log('  opening a pull request…')
    url = quiet(`gh pr create --fill --base ${MAIN}`)
  }
  if (!url) die('Pushed, but gh could not open a PR. Open it by hand.')

  if (args.includes('--no-merge')) {
    console.log(`\n  ${url}\n  Merge it when you are ready: gh pr merge --squash\n`)
    return
  }

  // Auto-merge hands the decision to CI, which is the only thing that should be
  // deciding. If the repo has not enabled it, say so rather than merging anyway.
  //
  // Deliberately not --delete-branch: the repo has branch deletion switched off
  // because deleting a merged branch closes anything stacked on it, and that has
  // already closed one PR here. Branches go when the lane is closed, which is
  // something someone decides rather than something a merge does.
  const auto = quiet('gh pr merge --squash --auto')
  console.log(
    auto === null
      ? `\n  ${url}\n  Auto-merge is not enabled on this repo — merge once CI is green:\n    gh pr merge --squash\n`
      : `\n  ${url}\n  Queued to squash-merge as soon as CI is green. Then: npm run lane:done ${path.basename(root())}\n` +
          `  main requires branches to be current, so if another lane lands first:\n    gh pr update-branch\n`,
  )
}

function done(name) {
  if (!name) die('Usage: npm run lane:done <task>')
  const where = path.join(laneRoot(), name)
  if (!existsSync(where)) die(`No lane at ${where}`)
  if (dirty(where)) die(`${name} has uncommitted changes. Land them, or remove it by hand if they are disposable.`)

  loud(`git worktree remove ${JSON.stringify(where)}`)
  // Build output is ignored, so git leaves it — and a few hundred kilobytes of
  // .next under a directory named after a finished task is exactly the kind of
  // thing nobody dares delete later. The remove above already refused if there
  // was anything tracked to lose.
  if (existsSync(where)) rmSync(where, { recursive: true, force: true })
  const removed = quiet(`git branch -D ${name}`) !== null
  // The remote branch is this command's job precisely because the merge is not
  // allowed to do it. Gone by now if someone tidied it already, which is fine.
  const pushed = quiet(`git push ${REMOTE} --delete ${name}`) !== null
  quiet('git worktree prune')
  console.log(`\n  ${name} closed${removed ? '' : ' (local branch kept)'}${pushed ? '' : ', remote branch already gone'}.\n`)
}

/* Claude Code hooks. Each reads the event JSON on stdin and answers on stdout. */

const stdin = () => {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

function sessionStart() {
  const branch = branchNow()
  const lane = inLane() ? path.basename(root()) : null
  const others = run('git worktree list --porcelain')
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => path.basename(l.slice(9)))
    .filter((n) => n !== path.basename(root()))

  const lines = [
    lane ? `You are in lane "${lane}" on branch ${branch}.` : `You are in the MAIN CHECKOUT, on branch ${branch}.`,
    lane
      ? 'Commit freely here; npm run land when it is finished.'
      : 'Do not edit or commit here — another session may be using it. Open a lane: npm run lane <task>',
    others.length ? `Other worktrees right now: ${others.join(', ')}. Run npm run lanes to see what they are doing.` : null,
    `Files two lanes must not edit at once: ${CONTENDED.join(', ')}.`,
  ].filter(Boolean)

  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join(' ') } }))
}

function guard() {
  const command = stdin().tool_input?.command ?? ''
  const deny = (reason) =>
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }))

  const onMain = branchNow() === MAIN
  if (/\bgit\s+(commit|merge|rebase)\b/.test(command) && onMain && !/ALLOW_MAIN=1/.test(command)) {
    return deny(`This is ${MAIN}. Work in a lane instead: npm run lane <task>. Landing is what writes to ${MAIN}, via npm run land.`)
  }
  if (/\bgit\s+push\b.*(--force(?!-with-lease)|\s-f\b)/.test(command)) {
    return deny('Force-pushing can destroy another lane\'s work. Use --force-with-lease, and say why.')
  }
  if (/\bgit\s+push\b/.test(command) && onMain) {
    return deny(`Pushing ${MAIN} directly skips CI and the review. Land a lane instead: npm run land.`)
  }
}

/** Nothing an agent does should be lost because a turn ended. */
function checkpoint() {
  if (!inLane() || branchNow() === MAIN || !dirty(undefined)) return
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
  quiet('git add -A')
  const saved = quiet(`git commit -q -m "wip: ${branchNow()} ${stamp}"`) !== null
  if (saved) console.log(JSON.stringify({ systemMessage: `Checkpointed to ${branchNow()}.`, suppressOutput: true }))
}

function touched() {
  const file = stdin().tool_input?.file_path ?? ''
  const hit = CONTENDED.find((c) => file.endsWith(c))
  if (!hit) return
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `${hit} is a contended file — another lane routes through it too. Keep this change small and land it soon; a long-lived branch touching it is the conflict everyone pays for.`,
      },
    }),
  )
}

const [command, ...rest] = process.argv.slice(2)
const hooks = { 'session-start': sessionStart, guard, checkpoint, touched }

switch (command) {
  case 'open':
    open(rest[0])
    break
  case 'list':
    list()
    break
  case 'land':
    land(rest)
    break
  case 'done':
    done(rest[0])
    break
  case 'hook':
    hooks[rest[0]]?.()
    break
  default:
    die('Commands: open <task> · list · land · done <task> · hook <name>')
}
// scratch
