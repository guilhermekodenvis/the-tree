// Monta a mensagem que vai ao agente quando você escolhe skills com "/".
// O texto da skill vai junto da mensagem, então funciona igual no Claude, no
// ChatGPT e no Gemini, sem depender de cada um saber onde procurar skills.
import type { SkillContent } from './store'

export function withSkills(message: string, skills: SkillContent[]): string {
  if (skills.length === 0) return message
  const blocks = skills.map(
    (skill) =>
      `<skill name="${skill.name}" file="${skill.file}">\n` +
      `Arquivos auxiliares desta skill (citados nas instruções) ficam em: ${skill.dir}\n\n` +
      `${skill.body}\n</skill>`
  )
  const names = skills.map((s) => `"${s.name}"`).join(', ')
  const request = message.trim() || '(sem texto adicional: aplique a skill ao projeto atual)'
  return (
    `Use ${skills.length === 1 ? 'a skill' : 'as skills'} ${names} para atender este pedido. ` +
    `Siga as instruções abaixo.\n\n${blocks.join('\n\n')}\n\nPedido:\n${request}`
  )
}
