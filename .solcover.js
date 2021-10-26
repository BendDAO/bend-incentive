module.exports = {
  skipFiles: ["test/"],
  // https://github.com/sc-forks/solidity-coverage/blob/master/docs/advanced.md#skipping-tests
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true, // Run the grep's inverse set.
  },
};
