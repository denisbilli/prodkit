class Attachment < ApplicationRecord
  ACCEPTABLE_FILE_TYPES = %w[image/png image/jpeg application/pdf text/plain].freeze

  belongs_to :message
  has_one_attached :file
  validate :acceptable_file

  private

  def acceptable_file
    return if ACCEPTABLE_FILE_TYPES.include?(file.content_type)

    errors.add(:file, 'type not supported')
  end
end
