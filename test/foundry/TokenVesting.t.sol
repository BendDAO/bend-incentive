// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import "forge-std/Test.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../contracts/test/ERC20Mock.sol";
import "../../contracts/incentives/TokenVesting.sol";

contract TokenVestingTest is Test {
    uint40 public constant blockInitTime = 1706716800;
    Vm public tsHEVM = Vm(HEVM_ADDRESS);

    bytes32 internal nextUser = keccak256(abi.encodePacked("user address"));

    function getNextUserAddress() public returns (address payable) {
        // bytes32 to address conversion
        address payable user = payable(address(uint160(uint256(nextUser))));
        nextUser = keccak256(abi.encodePacked(nextUser));
        return user;
    }

    function setUp() public {}

    function test() public {
        ERC20Mock bend = new ERC20Mock("BendToken", "BEND");
        uint256 totalAmount = 1000000 * 10**18;
        address owner = getNextUserAddress();
        bend.mint(owner, totalAmount);

        address benificiary = getNextUserAddress();
        uint40 startTime = blockInitTime + 1 days;
        uint40 endTime = startTime + 360 days;

        TokenVesting vesting = new TokenVesting(
            address(bend),
            totalAmount,
            benificiary,
            startTime,
            endTime
        );
        vesting.transferOwnership(owner);

        tsHEVM.prank(owner);
        bend.transfer(address(vesting), totalAmount);

        tsHEVM.warp(startTime);
        assertEq(vesting.claimable(), 0, "claimable not zero");

        tsHEVM.warp(endTime);
        assertEq(vesting.claimable(), totalAmount, "claimable not totalAmount");

        tsHEVM.warp(startTime + 180 days);
        uint256 halfClaim = totalAmount / 2 - 1;
        assertEq(vesting.claimable(), halfClaim, "claimable not halfClaim");

        tsHEVM.prank(benificiary);
        vesting.claim();
        assertEq(
            bend.balanceOf(benificiary),
            halfClaim,
            "balanceOf not halfClaim"
        );

        tsHEVM.prank(owner);
        vesting.withdraw();
        assertEq(
            bend.balanceOf(owner),
            (totalAmount - halfClaim),
            "balanceOf not totalAmount - halfClaim"
        );
        assertEq(bend.balanceOf(address(vesting)), 0, "balanceOf not zero");
    }

    function testRevert() public {
        ERC20Mock bend = new ERC20Mock("BendToken", "BEND");
        uint256 totalAmount = 1000000 * 10**18;
        address owner = getNextUserAddress();
        bend.mint(owner, totalAmount);

        address benificiary = getNextUserAddress();
        uint40 startTime = blockInitTime + 1 days;
        uint40 endTime = startTime + 360 days;

        TokenVesting vesting = new TokenVesting(
            address(bend),
            totalAmount,
            benificiary,
            startTime,
            endTime
        );
        vesting.transferOwnership(owner);

        address hacker = getNextUserAddress();

        vm.expectRevert(bytes("invalid caller"));
        tsHEVM.prank(hacker);
        vesting.claim();

        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        tsHEVM.prank(hacker);
        vesting.withdraw();

        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        tsHEVM.prank(hacker);
        vesting.changeAmount(1);

        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        tsHEVM.prank(hacker);
        vesting.changeBenificiary(owner);

        vm.expectRevert(bytes("Ownable: caller is not the owner"));
        tsHEVM.prank(hacker);
        vesting.changeTime(1, 1);
    }
}
