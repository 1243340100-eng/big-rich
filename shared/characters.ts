export const CHARACTER_SKINS = [
  {id:'lucky-cat',name:'招财小猫',emoji:'🐱',title:'好运营业中',description:'奶油白小猫举起招财爪，抱紧金色小判，红项圈上的铃铛叮当作响。',color:'#f3dfb7'},
  {id:'piggy-bank',name:'存钱罐小猪',emoji:'🐷',title:'把小确幸存起来',description:'草莓牛奶色的陶瓷小猪，背上插着一枚金币，肚皮上藏着爱心印记。',color:'#efb3be'},
  {id:'wall-street-wolf',name:'华尔街之狼',emoji:'🐺',title:'今天也要优雅开盘',description:'穿海军蓝西装的小灰狼，系上酒红领带，拿着迷你公文包认真做功课。',color:'#9bafc2'},
  {id:'compound-bunny',name:'复利小兔',emoji:'🐰',title:'慢慢来，财富会发芽',description:'薄荷围裙、软软长耳朵，抱着一盆长出金币的小苗，每天进步一点点。',color:'#b6d6c2'},
  {id:'fortune-panda',name:'富贵熊猫',emoji:'🐼',title:'竹报平安，富贵常在',description:'糯米团子一样的小熊猫，穿红色小马甲，双手抱着圆滚滚的金元宝。',color:'#e6dbcb'},
  {id:'vault-bear',name:'金库小熊',emoji:'🐻',title:'替你守好每一份积蓄',description:'蜂蜜色小熊戴着软帽，系着湖蓝背带，抱一把能打开梦想金库的钥匙。',color:'#cba37b'},
  {id:'abacus-fox',name:'算盘小狐',emoji:'🦊',title:'精打细算，也要可爱',description:'橘子色小狐狸围着青绿领巾，抱着一把袖珍算盘，尾尖像一团奶油。',color:'#df9b6a'},
  {id:'shopkeeper-penguin',name:'掌柜企鹅',emoji:'🐧',title:'小店开张，请多关照',description:'圆肚皮的小企鹅戴着焦糖小帽子，挂上小围兜，捧着刚刚结清的小账本。',color:'#7a9eac'},
] as const;

export type CharacterSkin = typeof CHARACTER_SKINS[number]['id'];
export function isCharacterSkin(value:unknown):value is CharacterSkin{return CHARACTER_SKINS.some(skin=>skin.id===value);}
export function characterFor(value:unknown,index=0){return CHARACTER_SKINS.find(skin=>skin.id===value)??CHARACTER_SKINS[((index%CHARACTER_SKINS.length)+CHARACTER_SKINS.length)%CHARACTER_SKINS.length];}
export const PAWN_SCALE=.25;
export const PAWN_RADIUS=.12;
