export type PhotoCallbackToken = {
  generation: number;
  transitionToken: number;
};

export function createStreamBidPhotoSession() {
  let generation = 0;
  let transitionToken = 0;
  let timerResetCount = 0;

  return {
    beginLot() {
      generation += 1;
      timerResetCount = 1;
      return generation;
    },
    beginTransition(): PhotoCallbackToken {
      transitionToken += 1;
      return { generation, transitionToken };
    },
    isCurrent(token: PhotoCallbackToken) {
      return token.generation === generation && token.transitionToken === transitionToken;
    },
    timerResetCount() {
      return timerResetCount;
    },
  };
}
