/* Search-only transliteration and spelling aliases; source names are unchanged. */
'use strict';
(()=>{
const cyrillic={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',і:'i',ї:'yi',є:'ye',ґ:'g'};
const scholarly={č:'ch',š:'sh',ž:'zh',ŝ:'shch',â:'ya',û:'yu',ë:'yo'};
function normalize(value){
 return String(value??'').toLowerCase().normalize('NFC')
 .replace(/[а-яёіїєґ]/g,c=>cyrillic[c]).replace(/[čšžŝâûë]/g,c=>scholarly[c])
 .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .replace(/shch|sch/g,'shch').replace(/kh/g,'h')
 .replace(/ya|ja|ia/g,'ia').replace(/yu|ju|iu/g,'iu').replace(/yo|jo/g,'e')
 .replace(/ye|je/g,'e').replace(/[yj]/g,'i').replace(/i+/g,'i')
 .replace(/[^a-z0-9\u3400-\u9fff]/g,'');
}
function index(fields){return [...new Set(fields.filter(x=>x!=null).map(normalize).filter(Boolean))]}
function terms(query){return String(query??'').trim().split(/\s+/).map(normalize).filter(Boolean)}
function matches(fields,query){const qs=Array.isArray(query)?query:terms(query);return qs.every(q=>fields.some(field=>field.includes(q)))}
const airlineAliases={
 iraero:['IrAero','Ir Aero'],polar:['Polar Airlines','Polyarnye Avialinii'],chuko:['Chukotavia'],
 arctic:['Arctic Airlines','2nd Arkhangelsk United Aviation Division'],kam:['Kamchatka Aviation Enterprise','Petropavlovsk Kamchatsky Air Enterprise'],
 khab:['Khabarovsk Airlines','Khabavia'],vologda:['Vologda Aviation Enterprise','Vologda Air'],taiga:['Taiga'],
 nao:['Naryan Mar United Air Detachment'],alrosa:['Alrosa'],kras:['KrasAvia'],yakutia:['Yakutia','Yakutiya'],
 redwings:['Red Wings','Ред Вингс'],yamal:['Yamal'],sila:['Siberian Light Aviation','SiLA'],kostroma:['Kostroma Aviation Enterprise','Kostroma Air'],rossiya:['Rossiya','Rossia','Rossija'],aeroservice:['Aeroservice','Aeroservis'],aeroprom:['Aeroprom'], 'utair-heli':['Utair Helicopter Services','UTair'], 'arctika-charter':['Arktika Perevozki','Arctika Perevozki']
};
window.ATLAS_SEARCH={normalize,index,terms,matches,airlineAliases};
})();
