# Bend-incentive
## Incentive Architecture
Bend will motivate both behaviors
1. Depositors provide liquidity to bend protocal
2. The borrower borrows in the bend agreement

## BendProtocolIncentivesController
Every time a deposit or loan occurs in the bend protocol, this contract is called to update the incentive state, and a user's reward is calculated by using a distribution index, which is updated over time and represents the accumulation of rewards. Each user has an independent index to determine the reward amount for a specific user
