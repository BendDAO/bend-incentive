// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

interface IMinerNFT is IERC721Upgradeable {
    /**
     * @dev Emitted on mint
     * @param user The address initiating the burn
     * @param nftAsset address of the underlying asset of NFT
     * @param nftTokenId token id of the underlying asset of NFT
     * @param owner The owner address receive the bNFT token
     **/
    event Mint(
        address indexed user,
        address indexed nftAsset,
        uint256 nftTokenId,
        address indexed owner
    );

    /**
     * @dev Emitted on burn
     * @param user The address initiating the burn
     * @param nftAsset address of the underlying asset of NFT
     * @param nftTokenId token id of the underlying asset of NFT
     * @param owner The owner address of the burned bNFT token
     **/
    event Burn(
        address indexed user,
        address indexed nftAsset,
        uint256 nftTokenId,
        address indexed owner
    );

    /**
     * @dev Mints bNFT token to the user address
     *
     * Requirements:
     *  - The caller must be contract address.
     *  - `nftTokenId` must not exist.
     *
     * @param to The owner address receive the bNFT token
     * @param tokenId token id of the underlying asset of NFT
     **/
    function mint(address to, uint256 tokenId) external;

    /**
     * @dev Burns user bNFT token
     *
     * Requirements:
     *  - The caller must be contract address.
     *  - `tokenId` must exist.
     *
     * @param tokenId token id of the underlying asset of NFT
     **/
    function burn(uint256 tokenId) external;

    /**
     * @dev Returns the owner of the `nftTokenId` token.
     *
     * Requirements:
     *  - `tokenId` must exist.
     *
     * @param tokenId token id of the underlying asset of NFT
     */
    function minterOf(uint256 tokenId) external view returns (address);

    /**
     * @dev Returns the address of the underlying asset.
     */
    function underlyingAsset() external view returns (address);
}
