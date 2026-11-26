// Anexos de uma mensagem (na conversa e na caixa de mensagem antes de enviar).
import type { Attachment } from '../../../shared/types'
import { Icon } from './ui/Icon'
/** Anexos de uma mensagem: miniatura das imagens e um cartão para os outros arquivos. */
export function AttachmentList({
  attachments,
  onRemove
}: {
  attachments: Attachment[]
  /** Com isso, cada anexo ganha um × (caixa de mensagem). */
  onRemove?(attachment: Attachment): void
}) {
  return (
    <div className="attachments">
      {attachments.map((file) => (
        <span
          key={file.path}
          className={`attachment attachment--${file.kind}`}
          title={`${file.name} · ${formatSize(file.size)}`}
        >
          {file.kind === 'image' ? (
            <img src={file.url} alt={file.name} className="attachment__image" />
          ) : (
            <>
              <Icon name="document" />
              <span className="attachment__name truncate">{file.name}</span>
            </>
          )}
          {onRemove && (
            <button
              type="button"
              className="attachment__remove"
              aria-label={`Tirar o anexo ${file.name}`}
              onClick={() => onRemove(file)}
            >
              <Icon name="dismiss" />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
