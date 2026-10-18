// The shared desktop owns startup and updates. This module never spawns a daemon or checks npm.
export async function npmOpenfilm(){return{latest:null,checkedAt:null};}
export function olderThanThis(){return false;}
