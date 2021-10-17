import BN from "bn.js";
import Decimal from "decimal.js";
/* Helper functions for converting string-ified decimal numbers  to uint-ified decimal representations.

Since inputs can exceed the maximum safe integer in JS (~ 9e+15), we make a BigNum (BN) from a string, and then
pass it to a DeciMath function.

Example usage:

Input: makeBN18('999.123456789987654321') ---->  Output: new BN('999123456789987654321', 10)
Input: makeBN18('1.000000000000000001')  ---->  Output: new BN('1000000000000000001', 10) */

// Convert a string-ified decimal to a BN of arbitrary decimal places

export function makeBN(num: string | number, precision: number) {
  let strNum = num.toString();

  checkOnlyNumericChars(strNum);

  const intPart = strNum.split(".")[0];
  const fractionPart = strNum.includes(".") ? strNum.split(".")[1] : "";

  if (fractionPart.length > precision) {
    throw new Error(
      `MakeBN: argument must have <= ${precision} decimal places`
    );
  }

  const trailingZeros = "0".repeat(precision - fractionPart.length);
  const bigNumArg = intPart + fractionPart + trailingZeros;
  return new BN(bigNumArg, 10);
}

export function checkOnlyNumericChars(input: string) {
  try {
    let num = new Decimal(input);
  } catch (err) {
    throw new Error(
      `MakeBN: input must be number or string-ified number, no non-numeric characters`
    );
  }
}

export function makeBN18(strNum: string | number) {
  return makeBN(strNum, 18);
}

// Convert a BN uint representation to a 'Decimal' object, with the same number of decimal places
export function makeDecimal(num: string | number, digits: number) {
  let strBN = num.toString();
  let fractPart;
  let intPart;
  let resNum;

  if (strBN.length <= digits) {
    const fractPartZeros = "0".repeat(digits - strBN.length);
    fractPart = fractPartZeros + strBN;
    resNum = new Decimal("0." + fractPart);
  } else if (strBN.length > digits) {
    fractPart = strBN.slice(-digits); // grab digits after decimal point
    intPart = strBN.slice(0, strBN.length - digits); // grab digits preceding decimal point
    resNum = new Decimal(intPart + "." + fractPart);
  }
  return resNum;
}

export function makeDecimal18(num: string | number) {
  return makeDecimal(num, 18);
}
