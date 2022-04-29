import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, BigNumber, constants } from "ethers";
import {
  deployBendTokenTester,
  deployReferralRewardDistributor,
  deployVault,
  deployContract,
} from "../deployHelper";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import BalanceTree from "../utils/balance-tree";
import { parseBalanceMap } from "../utils/parse-balance-map";

import { makeBN, makeBN18, timeLatest } from "../utils";
import { buffer } from "stream/consumers";

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("ReferralRewardDistributor tests", function () {
  let deployer: SignerWithAddress;
  let users: SignerWithAddress[];
  let vault: Contract;

  before(async function () {
    let addresses = await ethers.getSigners();
    [deployer] = addresses;
    users = addresses.slice(1, addresses.length);
  });

  async function deployDistributor(tree?: BalanceTree) {
    const token = await deployBendTokenTester(deployer, makeBN18(1000000));
    const distributor = await deployReferralRewardDistributor(token);
    if (tree) {
      await distributor.connect(deployer).setMerkleRoot(tree.getHexRoot());
    }
    return { token, distributor };
  }

  describe("#token", () => {
    it("returns the token address", async () => {
      const { token, distributor } = await deployDistributor();
      expect(await distributor.token()).to.eq(token.address);
    });
  });

  describe("#merkleRoot", () => {
    it("returns the zero merkle root", async () => {
      const { token, distributor } = await deployDistributor();
      expect(await distributor.merkleRoot()).to.eq(ZERO_BYTES32);
    });
  });

  describe("#claim", () => {

    it("fails for no merkle root", async () => {
      const { token, distributor } = await deployDistributor();
      await expect(
        distributor.claim(0, users[0].address, 10, [])
      ).to.be.revertedWith("MerkleDistributor: Merkle root not set.");
    });

    describe("two account tree", () => {
      let distributor: Contract;
      let token: Contract;
      let tree: BalanceTree;
      beforeEach("deploy", async () => {
        tree = new BalanceTree([
          { account: users[0].address, amount: makeBN18(100) },
          { account: users[1].address, amount: makeBN18(101) },
        ]);
        const contracts = await deployDistributor(tree);

        token = contracts.token;
        distributor = contracts.distributor;
        await token.setBalance(distributor.address, makeBN18(201));
      });

      it("fails for empty proof", async () => {
        await expect(
          distributor.claim(0, users[0].address, makeBN18(100), [])
        ).to.be.revertedWith("MerkleDistributor: Invalid proof.");
      });

      it("successful claim", async () => {
        const proof0 = tree.getProof(0, users[0].address, makeBN18(100));
        await expect(
          distributor.claim(0, users[0].address, makeBN18(100), proof0)
        )
          .to.emit(distributor, "Claimed")
          .withArgs(tree.getHexRoot(), 0, users[0].address, makeBN18(100));
        const proof1 = tree.getProof(1, users[1].address, makeBN18(101));
        await expect(
          distributor.claim(1, users[1].address, makeBN18(101), proof1)
        )
          .to.emit(distributor, "Claimed")
          .withArgs(tree.getHexRoot(), 1, users[1].address, makeBN18(101));

        expect(await distributor.claimedAmount(users[0].address)).to.eq(makeBN18(100));
      });

      it("transfers the token", async () => {
        const proof0 = tree.getProof(0, users[0].address, makeBN18(100));
        expect(await token.balanceOf(users[0].address)).to.eq(0);
        await distributor.claim(0, users[0].address, makeBN18(100), proof0);
        expect(await token.balanceOf(users[0].address)).to.eq(makeBN18(100));
      });

      it("must have enough to transfer", async () => {
        const proof0 = tree.getProof(0, users[0].address, makeBN18(100));
        await token.setBalance(distributor.address, makeBN18(99));
        await expect(
          distributor.claim(0, users[0].address, makeBN18(100), proof0)
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      });

      it("sets #isClaimed", async () => {
        const proof0 = tree.getProof(0, users[0].address, makeBN18(100));
        expect(await distributor.isClaimed(users[0].address)).to.eq(false);
        expect(await distributor.isClaimed(users[1].address)).to.eq(false);
        await distributor.claim(0, users[0].address, makeBN18(100), proof0);
        expect(await distributor.isClaimed(users[0].address)).to.eq(true);
        expect(await distributor.isClaimed(users[1].address)).to.eq(false);
      });

      it("cannot allow two claims", async () => {
        const proof0 = tree.getProof(0, users[0].address, makeBN18(100));
        await distributor.claim(0, users[0].address, makeBN18(100), proof0);
        await expect(
          distributor.claim(0, users[0].address, makeBN18(100), proof0)
        ).to.be.revertedWith("MerkleDistributor: Drop already claimed.");
      });
      it("cannot claim more than once: 0 and then 1", async () => {
        await distributor.claim(
          0,
          users[0].address,
          makeBN18(100),
          tree.getProof(0, users[0].address, makeBN18(100))
        );
        await distributor.claim(
          1,
          users[1].address,
          makeBN18(101),
          tree.getProof(1, users[1].address, makeBN18(101))
        );

        await expect(
          distributor.claim(
            0,
            users[0].address,
            makeBN18(100),
            tree.getProof(0, users[0].address, makeBN18(100))
          )
        ).to.be.revertedWith("MerkleDistributor: Drop already claimed.");
      });

      it("cannot claim more than once: 1 and then 0", async () => {
        await distributor.claim(
          1,
          users[1].address,
          makeBN18(101),
          tree.getProof(1, users[1].address, makeBN18(101))
        );
        await distributor.claim(
          0,
          users[0].address,
          makeBN18(100),
          tree.getProof(0, users[0].address, makeBN18(100))
        );

        await expect(
          distributor.claim(
            1,
            users[1].address,
            makeBN18(101),
            tree.getProof(1, users[1].address, makeBN18(101))
          )
        ).to.be.revertedWith("MerkleDistributor: Drop already claimed.");
      });

      it("cannot claim for address other than proof", async () => {
        const proof0 = tree.getProof(0, users[0].address, makeBN18(100));
        await expect(
          distributor.claim(1, users[1].address, makeBN18(101), proof0)
        ).to.be.revertedWith("MerkleDistributor: Invalid proof.");
      });

      it("cannot claim more than proof", async () => {
        const proof0 = tree.getProof(0, users[0].address, makeBN18(100));
        await expect(
          distributor.claim(0, users[0].address, makeBN18(101), proof0)
        ).to.be.revertedWith("MerkleDistributor: Invalid proof.");
      });

      // it("gas", async () => {
      //   const proof = tree.getProof(0, users[0].address, makeBN18(100));
      //   const tx = await distributor.claim(0, users[0].address, 100, proof);
      //   const receipt = await tx.wait();
      //   expect(receipt.gasUsed).to.eq(78466);
      // });
    });
    describe("larger tree", () => {
      let distributor: Contract;
      let token: Contract;
      let tree: BalanceTree;
      let smartContract: Contract;
      let nodes: { account: string; amount: BigNumber }[];
      beforeEach("deploy", async () => {
        nodes = users.map((user, index) => {
          return {
            account: user.address,
            amount: makeBN18((index + 1) * 100),
          };
        });
        smartContract = await deployContract("SomeContract");
        let length = nodes.length;
        nodes.push({
          account: smartContract.address,
          amount: makeBN18((length + 1) * 100),
        });
        tree = new BalanceTree(nodes);
        const contracts = await deployDistributor(tree);

        token = contracts.token;
        distributor = contracts.distributor;
        await token.setBalance(distributor.address, makeBN18(100000));
      });

      it("claim index 4", async () => {
        const proof = tree.getProof(4, users[4].address, makeBN18(500));
        await expect(
          distributor.claim(4, users[4].address, makeBN18(500), proof)
        )
          .to.emit(distributor, "Claimed")
          .withArgs(tree.getHexRoot(), 4, users[4].address, makeBN18(500));
      });

      it("claim index 7", async () => {
        const proof = tree.getProof(7, users[7].address, makeBN18(800));
        await expect(
          distributor.claim(7, users[7].address, makeBN18(800), proof)
        )
          .to.emit(distributor, "Claimed")
          .withArgs(tree.getHexRoot(), 7, users[7].address, makeBN18(800));
      });

      it("smart contract claim", async () => {
        const proof = tree.getProof(
          nodes.length - 1,
          smartContract.address,
          makeBN18(nodes.length * 100)
        );
        await expect(
          distributor.claim(
            nodes.length,
            smartContract.address,
            makeBN18(nodes.length * 100),
            proof
          )
        ).to.be.revertedWith(
          "MerkleDistributor: Smart contract claims not allowed."
        );
      });

      describe("#claimed amount", () => {
        it("claimed amout accumulate", async () => {
          tree = new BalanceTree([
            { account: users[0].address, amount: makeBN18(100) },
            { account: users[1].address, amount: makeBN18(101) },
          ]);
          const token = await deployBendTokenTester(deployer, makeBN18(1000000));
          const distributor = await deployReferralRewardDistributor(token);
          if (tree) {
            await distributor.connect(deployer).setMerkleRoot(tree.getHexRoot());
          }
          await token.setBalance(distributor.address, makeBN18(1000));
          const proof0 = tree.getProof(0, users[0].address, makeBN18(100));
          await expect(
            distributor.claim(0, users[0].address, makeBN18(100), proof0)
          )
            .to.emit(distributor, "Claimed")
            .withArgs(tree.getHexRoot(), 0, users[0].address, makeBN18(100));
          const proof1 = tree.getProof(1, users[1].address, makeBN18(101));
          await expect(
            distributor.claim(1, users[1].address, makeBN18(101), proof1)
          )
            .to.emit(distributor, "Claimed")
            .withArgs(tree.getHexRoot(), 1, users[1].address, makeBN18(101));

          expect(await distributor.claimedAmount(users[0].address)).to.eq(makeBN18(100));

          tree = new BalanceTree([
            { account: users[0].address, amount: makeBN18(200) },
            { account: users[1].address, amount: makeBN18(201) },
          ]);
          if (tree) {
            await distributor.connect(deployer).setMerkleRoot(tree.getHexRoot());
          }
          const proof0Second = tree.getProof(0, users[0].address, makeBN18(200));
          await expect(
            distributor.claim(0, users[0].address, makeBN18(200), proof0Second)
          )
            .to.emit(distributor, "Claimed")
            .withArgs(tree.getHexRoot(), 0, users[0].address, makeBN18(200));
          expect(await distributor.claimedAmount(users[0].address)).to.eq(makeBN18(300));
        });
      });

      // it("gas", async () => {
      //   const proof = tree.getProof(7, users[7].address, makeBN18(800));
      //   const tx = await distributor.claim(
      //     7,
      //     users[7].address,
      //     makeBN18(800),
      //     proof
      //   );
      //   const receipt = await tx.wait();
      //   expect(receipt.gasUsed).to.eq(80960);
      // });

      // it("gas second down about 15k", async () => {
      //   await distributor.claim(
      //     0,
      //     users[0].address,
      //     makeBN18(100),
      //     tree.getProof(0, users[0].address, makeBN18(100))
      //   );
      //   const tx = await distributor.claim(
      //     1,
      //     users[1].address,
      //     makeBN18(200),
      //     tree.getProof(1, users[1].address, makeBN18(200))
      //   );
      //   const receipt = await tx.wait();
      //   expect(receipt.gasUsed).to.eq(65940);
      // });
    });
  });
});
