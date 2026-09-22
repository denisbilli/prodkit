ActiveRecord::Schema[7.1].define(version: 2025_06_01_000000) do
  create_table "moderations", force: :cascade do |t|
    t.text "action", null: false
    t.bigint "comment_id"
    t.datetime "created_at", precision: nil, null: false
    t.bigint "moderator_user_id"
    t.text "reason"
    t.bigint "story_id"
    t.datetime "updated_at", precision: nil, null: false
    t.bigint "user_id"
  end

  create_table "stories", force: :cascade do |t|
    t.string "title", null: false
    t.bigint "user_id"
    t.datetime "created_at", precision: nil, null: false
  end
end
