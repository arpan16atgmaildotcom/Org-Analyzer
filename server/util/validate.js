const ALIAS_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

function isValidAlias(s) {
  return typeof s === "string" && ALIAS_REGEX.test(s);
}

module.exports = { isValidAlias };
