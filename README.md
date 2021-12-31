# Bend-incentive
## Incentive Architecture


bend 将激励两种行为
1. 存款人为 bend protocal 提供流动性
2. 借款人在 bend 协议中借款


## BendProtocolIncentivesController
每次在bend协议中发生存款，借款时，都会调用这个合约来更新激励状态，通过使用一个分配指数来计算某个用户的奖励，该指数随着时间更新，代表奖励的积累。每个用户拥有独立的指数，以确定具体用户的奖励金额
