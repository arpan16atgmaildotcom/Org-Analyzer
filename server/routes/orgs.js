const express = require("express");
const { listOrgs } = require("../sfdx");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const orgs = await listOrgs();
    res.json({ orgs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
