const express = require('express');

const router = express.Router();

router.delete('/admin/users/:id', async (req, res) => {
  await deleteUser(req.params.id);
  res.status(204).end();
});

async function deleteUser(id) {
  return db.users.remove({ id });
}

async function delete_account(accountId) {
  return db.providerAccounts.remove({ id: accountId });
}

module.exports = { router, deleteUser, delete_account };
