import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { ImageLightbox } from "@/components/image-lightbox";

interface AttachmentLightboxProps {
  metadata: AttachmentMetadata | null;
  onClose: () => void;
}

export function AttachmentLightbox({ metadata, onClose }: AttachmentLightboxProps) {
  const url = useAttachmentPreviewUrl(metadata);
  return (
    <ImageLightbox
      visible={metadata !== null}
      uri={url}
      onClose={onClose}
      testIDPrefix="attachment-lightbox"
    />
  );
}
