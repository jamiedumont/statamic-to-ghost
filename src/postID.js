export function nextAvailableId(postArr) {
  if (postArr.length == 0) return 1;
  const lastPost =  postArr.sort((a, b) => a.id < b.id).slice(-1)[0];
  return lastPost.id + 1;
}

export const postIndex = []