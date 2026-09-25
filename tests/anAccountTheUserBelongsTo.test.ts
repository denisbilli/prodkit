import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function tenancy(files: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-account-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return {
    organization: analysis.detectors['tenancy.organization']?.present,
    membership: analysis.detectors['tenancy.membership']?.present,
  };
}

/**
 * papercups scopes everything by `account_id`, and its `users` schema says
 * `belongs_to(:account, Account)`. `account` alone is a person's own login in a
 * consumer app, so it never counted; the person being inside the account is what makes
 * the account a customer. papercups was inferred as a consumer app at high confidence.
 */
describe('an account the user belongs to', () => {
  it('reads an Ecto users schema that belongs to an account as a tenant', async () => {
    const found = await tenancy({
      'mix.exs': 'defmodule Chat.MixProject do\n  defp deps, do: [{:phoenix, "~> 1.7"}]\nend\n',
      'lib/chat/users/user.ex': 'defmodule Chat.Users.User do\n  schema "users" do\n    field(:email, :string)\n    belongs_to(:account, Chat.Accounts.Account, type: :binary_id)\n  end\nend\n',
      'lib/chat/accounts/account.ex': 'defmodule Chat.Accounts.Account do\n  schema "accounts" do\n    has_many(:users, Chat.Users.User)\n  end\nend\n',
      'lib/chat/conversations.ex': 'def list(account_id), do: Conversation |> where(account_id: ^account_id) |> Repo.all()\n',
    });

    expect(found).toEqual({ organization: true, membership: true });
  });

  it('reads the same in an ActiveRecord User', async () => {
    const found = await tenancy({
      'Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
      'app/models/user.rb': 'class User < ApplicationRecord\n  belongs_to :account\nend\n',
      'app/models/account.rb': 'class Account < ApplicationRecord\n  has_many :users\nend\n',
      'app/models/ticket.rb': 'class Ticket < ApplicationRecord\n  scope :for, ->(user) { where(account_id: user.account_id) }\nend\n',
    });

    expect(found).toEqual({ organization: true, membership: true });
  });

  /** An account that belongs to the user is a profile, not a customer. */
  it('does not read an account a user owns as a tenant', async () => {
    const found = await tenancy({
      'Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
      'app/models/user.rb': 'class User < ApplicationRecord\n  has_one :account\nend\n',
      'app/models/account.rb': 'class Account < ApplicationRecord\n  belongs_to :user\n  validates :account_id, presence: true\nend\n',
    });

    expect(found).toEqual({ organization: false, membership: false });
  });

  /**
   * In a finance app an account is a bank account: maybe's transactions belong to one.
   * Only the users belonging to an account make it a customer.
   */
  it('does not read a bank account other records belong to as a tenant', async () => {
    const found = await tenancy({
      'Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
      'app/models/user.rb': 'class User < ApplicationRecord\n  has_many :accounts\nend\n',
      'app/models/transaction.rb': 'class Transaction < ApplicationRecord\n  belongs_to :account\n  scope :in, ->(a) { where(account_id: a.id) }\nend\n',
    });

    expect(found).toEqual({ organization: false, membership: false });
  });

  /**
   * mastodon's User belongs to an Account that `has_one :user` — the person's public
   * profile. One account, one person: not a customer with a team.
   */
  it('does not read a one-to-one profile account as a tenant', async () => {
    const found = await tenancy({
      'Gemfile': 'source "https://rubygems.org"\ngem "rails"\n',
      'app/models/user.rb': 'class User < ApplicationRecord\n  belongs_to :account, inverse_of: :user\nend\n',
      'app/models/account.rb': 'class Account < ApplicationRecord\n  has_one :user, inverse_of: :account\nend\n',
      'app/models/invite.rb': 'class Invite < ApplicationRecord\n  has_many :users, inverse_of: :invite\nend\n',
      'app/models/status.rb': 'class Status < ApplicationRecord\n  scope :by, ->(a) { where(account_id: a.id) }\nend\n',
    });

    expect(found).toEqual({ organization: false, membership: false });
  });
});

