// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.4;

/**
 * @title WadRayMath library
 * @author Bend
 * @dev Provides mul and div function for wads (decimal numbers with 18 digits precision) and rays (decimals with 27 digits)
 **/

library WadRayMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant HALF_WAD = WAD / 2;

    uint256 internal constant RAY = 1e27;
    uint256 internal constant HALF_RAY = RAY / 2;

    uint256 internal constant WAD_RAY_RATIO = 1e9;
    string internal constant MATH_MULTIPLICATION_OVERFLOW = "200";

    /**
     * @dev Multiplies two ray, rounding half up to the nearest ray
     * @param a Ray
     * @param b Ray
     * @return The result of a*b, in ray
     **/
    function rayMul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) {
            return 0;
        }

        require(
            a <= (type(uint256).max - HALF_RAY) / b,
            MATH_MULTIPLICATION_OVERFLOW
        );

        return (a * b + HALF_RAY) / RAY;
    }
}
