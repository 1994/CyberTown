/** These are unopened demo blocks, not purchasable unlocks. Streets and existing
 * exploration stops remain accessible; do not invent level/coin requirements. */
export const TOWN_LOCKED_AREAS = [
 {id:'old-town',name:'商业街坊',x:-20,z:5,minX:-30,maxX:-9,minZ:5,maxZ:18,hint:'商铺后续开放 · 奶茶店可经营'},
 {id:'play-street',name:'娱乐街坊',x:26,z:5,minX:10,maxX:30,minZ:5,maxZ:20,hint:'商铺后续开放 · 小游戏大厅可进入'},
 {id:'civic',name:'社区中心',x:0,z:-7,minX:-8.5,maxX:8.5,minZ:-6,maxZ:6,hint:'公共服务后续开放'},
 {id:'night-market',name:'夜市街区',x:-37,z:-3,minX:-43,maxX:-35,minZ:-24,maxZ:20,hint:'夜市经营后续开放 · 街道可通行'},
 {id:'west-blocks',name:'西街商坊',x:-61,z:2,minX:-89,maxX:-43,minZ:-25,maxZ:34,hint:'商铺后续开放 · 集市与河港可探索'},
 {id:'star-blocks',name:'星光街区',x:62,z:2,minX:42,maxX:89,minZ:-33,maxZ:38,hint:'娱乐设施后续开放 · 乐园与步道可探索'},
 {id:'north',name:'北区扩建',x:0,z:-36,minX:-90,maxX:90,minZ:-66,maxZ:-36,hint:'扩建玩法后续开放'},
] as const;
