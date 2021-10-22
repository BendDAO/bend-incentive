import { BigNumber, Event } from "ethers";

import { expect } from "chai";

interface CustomFieldLogic<Update, State> {
  fieldName: keyof State;
  logic: (
    stateUpdate: Update,
    stateBefore: State,
    stateAfter: State
  ) => Promise<string | BigNumber> | string | BigNumber;
}

export interface CompareRules<Update, State> {
  fieldsEqualToInput?: (keyof State)[];
  fieldsEqualToCustomInput?: {
    fieldName: keyof State;
    equalTo: keyof Update;
  }[];
  fieldsWithCustomLogic?: CustomFieldLogic<Update, State>[];
}

export async function compare<Input extends object, State extends object>(
  fieldsToTrack: (keyof State)[],
  input: Input,
  stateBefore: State,
  stateAfter: State,
  {
    fieldsEqualToInput = [],
    fieldsEqualToCustomInput = [],
    fieldsWithCustomLogic = [],
  }: CompareRules<Input, State> = {}
) {
  const unchangedFields = fieldsToTrack.filter(
    (fieldName) =>
      !fieldsEqualToInput.includes(fieldName) &&
      !fieldsEqualToCustomInput.find((eq) => eq.fieldName === fieldName) &&
      !fieldsWithCustomLogic.find((eq) => eq.fieldName === fieldName)
  );

  for (const fieldName of unchangedFields) {
    // @ts-ignore
    expect(stateAfter[fieldName].toString()).to.be.equal(
      // @ts-ignore
      stateBefore[fieldName].toString(),
      `${fieldName} should not change`
    );
  }

  for (const fieldName of fieldsEqualToInput) {
    // @ts-ignore
    expect(stateAfter[fieldName].toString()).to.be.equal(
      // @ts-ignore
      input[fieldName].toString(),
      `${fieldName} are not updated`
    );
  }

  for (const { fieldName, equalTo } of fieldsEqualToCustomInput) {
    // @ts-ignore
    expect(stateAfter[fieldName].toString()).to.be.equal(
      // @ts-ignore
      input[equalTo].toString(),
      `${fieldName} are not updated`
    );
  }

  for (const { fieldName, logic } of fieldsWithCustomLogic) {
    const logicOutput = logic(input, stateBefore, stateAfter);
    const equalTo =
      logicOutput instanceof Promise ? await logicOutput : logicOutput;
    // @ts-ignore
    expect(stateAfter[fieldName].toString()).to.be.equal(
      equalTo.toString(),
      `${fieldName} are not correctly updated`
    );
  }
}
