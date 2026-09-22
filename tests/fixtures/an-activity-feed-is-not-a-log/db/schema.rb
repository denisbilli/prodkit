ActiveRecord::Schema[7.1].define(version: 2025_06_01_000000) do
  create_table "activities", force: :cascade do |t|
    t.bigint "actor_id", null: false
    t.string "action", null: false
    t.bigint "subject_id"
    t.string "subject_type"
    t.datetime "created_at", precision: nil, null: false
  end
end
