import { ref } from 'vue'
import { uploadComposerImage } from '../api/codexGateway'
import type { UiComposerImage } from '../types/codex'

const MAX_IMAGE_COUNT = 8
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function getImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type))
}

export function hasImageFile(items: DataTransferItemList | null | undefined): boolean {
  if (!items) return false
  return Array.from(items).some((item) => item.kind === 'file' && item.type.startsWith('image/'))
}

export function useComposerImages() {
  const attachedImages = ref<UiComposerImage[]>([])
  const isUploadingImage = ref(false)
  const uploadError = ref('')

  function removeImage(imageId: string): void {
    attachedImages.value = attachedImages.value.filter((image) => image.id !== imageId)
  }

  function resetImages(): void {
    attachedImages.value = []
    uploadError.value = ''
  }

  async function attachFiles(files: FileList | File[]): Promise<void> {
    const imageFiles = getImageFiles(files)
    const remainingSlots = MAX_IMAGE_COUNT - attachedImages.value.length
    if (remainingSlots <= 0) {
      uploadError.value = `You can attach up to ${String(MAX_IMAGE_COUNT)} images`
      return
    }

    const candidates = imageFiles.slice(0, remainingSlots)
    if (candidates.length === 0) return

    isUploadingImage.value = true
    uploadError.value = ''

    try {
      const uploadedImages: UiComposerImage[] = []
      for (const file of candidates) {
        if (file.size > MAX_IMAGE_BYTES) {
          uploadError.value = `${file.name || 'Image'} is larger than 20 MB`
          continue
        }
        uploadedImages.push(await uploadComposerImage(file))
      }

      if (uploadedImages.length > 0) {
        attachedImages.value = [...attachedImages.value, ...uploadedImages]
      }
    } catch (error) {
      uploadError.value = error instanceof Error ? error.message : 'Image upload failed'
    } finally {
      isUploadingImage.value = false
    }
  }

  return {
    attachedImages,
    isUploadingImage,
    uploadError,
    attachFiles,
    removeImage,
    resetImages,
  }
}
