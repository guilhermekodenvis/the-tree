/** Texto legível de um erro, sem o prefixo que o Electron põe em erros do processo principal. */
export function messageOf(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
