// Chromium's setuid sandbox needs kernel privileges containers don't grant,
// so it must be disabled there. Off by default so local (non-container) runs
// keep the sandbox.
export function sandboxArgs(): string[] {
  return process.env.PUPPETEER_NO_SANDBOX === 'true'
    ? ['--no-sandbox', '--disable-setuid-sandbox']
    : [];
}
