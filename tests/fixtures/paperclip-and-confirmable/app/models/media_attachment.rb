class MediaAttachment < ApplicationRecord
  IMAGE_MIME_TYPES = %w(image/jpeg image/png image/gif image/webp).freeze

  belongs_to :user

  has_attached_file :file
  validates_attachment_content_type :file, content_type: IMAGE_MIME_TYPES
  validates_attachment_size :file, less_than: 16.megabytes
end
