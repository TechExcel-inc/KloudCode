import { createResource, Show } from "solid-js"
import { useData } from "../context/data"
import { useDialog } from "../context/dialog"
import { ImagePreview } from "./image-preview"
import { loadImageSource, optionImageSource } from "./markdown-image"

/** A choice's picture as a thumbnail; a click opens it large. Nothing shows when it cannot load. */
export function OptionImage(props: { image: string; alt: string }) {
  const data = useData()
  const dialog = useDialog()
  const [url] = createResource(
    () => props.image,
    (image) => loadImageSource(optionImageSource(image, data.directory), data.readFile),
  )
  return (
    <Show when={url()}>
      {(src) => (
        <button
          type="button"
          data-component="option-image"
          aria-label={props.alt}
          onClick={(event) => {
            event.stopPropagation()
            dialog.show(() => <ImagePreview src={src()} alt={props.alt} />)
          }}
        >
          <img src={src()} alt={props.alt} draggable={false} />
        </button>
      )}
    </Show>
  )
}
