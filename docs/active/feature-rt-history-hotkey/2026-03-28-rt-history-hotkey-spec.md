# 瀹炴椂杞綍銆佸巻鍙茶褰曚笌蹇嵎閿綍鍒朵笓棰?Spec

## 2026-03-29 快捷键状态机调整

- 删除“快速双击开始 / 快速双击停止”的状态分支。
- 保留长按定时器，但仅在空闲态按住超过阈值时进入长按模式并开始录音。
- 非长按场景改为单次完整按压切换：空闲态单击开始，录音态单击停止并转录。
- 长按模式下仅在松开时停止；长按释放不能再落入单击切换分支。
- `Esc` 取消逻辑不变。

鏇存柊鏃堕棿锛?026-03-28

涓婃父鏂囨。锛?- [涓撻闇€姹傛枃妗(D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- [0325绗竴闃舵鏀归€犺鍒?md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325绗竴闃舵鏀归€犺鍒?md)
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-27-ui-imitation-plan.md)

## 1. 鐩爣

鏈笓棰樺湪褰撳墠 Windows 涓荤獥鍙ｅ唴鏂板锛?- `瀹炴椂杞綍` 椤甸潰
- `鍘嗗彶璁板綍` 椤甸潰

骞惰ˉ榻愶細
- 閫氱敤椤典腑鐨?`鍚敤娴佸紡浼犺緭`銆乣AI 鎽樿鎬荤粨`銆乣淇濈暀闊抽`
- 蹇嵎閿〉涓殑鐪熷疄鎸夐敭褰曞埗鑳藉姏

鏈笓棰樺繀椤婚伒瀹堢幇鏈変富绐楀彛绾︽潫锛?- 鍗曞眰涓昏〃闈?- 渚ц竟鏍?+ 鍘熺敓璁剧疆椤?- 椤甸潰椋庢牸缁熶竴

## 2. 鍒嗗眰璁捐

鏈笓棰樹弗鏍兼寜涓夊眰瀹炵幇锛?
### 2.1 鍓嶇灞?
璐熻矗锛?- 椤甸潰灞曠ず
- 鐢ㄦ埛浜や簰
- 椤甸潰绾х姸鎬佸垏鎹?
涓嶈礋璐ｏ細
- 鐩存帴澶勭悊鍘熷娴佸紡鍗忚
- 鐩存帴鍐冲畾鍘嗗彶璁板綍鎸佷箙鍖栫粏鑺?- 鐩存帴鍋氬簳灞傞敭鐩樺綍鍒堕€昏緫

### 2.2 妗岄潰璋冮厤灞?
鐢?Tauri/Rust + 鍓嶇鐘舵€佸眰鍏卞悓鎵挎媴銆?
璐熻矗锛?- `/stream` 杩炴帴妗ユ帴涓庝簨浠惰仛鍚?- 瀹炴椂鐗囨鐘舵€佺鐞?- 鍘嗗彶璁板綍涓氬姟娴佺▼缂栨帓
- 蹇嵎閿綍鍒剁姸鎬佹満
- AI 鎽樿鐨勮Е鍙戠紪鎺?
杩欐槸鏈笓棰樼殑鏍稿績璋冨害灞傘€?
### 2.3 鍚庣灞?
缁х画璐熻矗锛?- `/stream`
- `/transcribe`
- 鍘嗗彶璁板綍 API 涓庢暟鎹瓨鍌?- 妯″瀷涓庤璇濅汉鑳藉姏
- 鐜版湁 AI 浼樺寲鑳藉姏

鍚庣鎻愪緵鍘熷鑳藉姏涓庡巻鍙茶褰曞瓨鍌ㄦ帴鍙ｏ紝妗岄潰璋冮厤灞傚喅瀹氭闈㈢濡備綍瑙﹀彂銆佺粍缁囧拰灞曠ず銆?
## 3. 椤甸潰鎵╁睍

褰撳墠渚ц竟鏍忛〉闈粠 5 椤规墿灞曚负 7 椤癸細
- `general`
- `engine`
- `realtime`
- `history`
- `vocabulary`
- `speaker`
- `hotkey`

瑕佹眰锛?- 鏂伴〉闈笌鐜版湁椤甸潰娌跨敤鍚屼竴濂楀竷灞€楠ㄦ灦
- 涓嶆柊澧炴柊鐨勫灞?panel 璇箟

## 4. 閫氱敤椤垫墿灞?
## 4.1 鏂板璁剧疆瀛楁

`AppSettings` 闇€瑕佹柊澧炶嚦灏戜互涓嬪瓧娈碉細
- `enableStreaming: boolean`
- `enableAISummary: boolean`
- `retainAudio: boolean`

榛樿鍊硷細
- `enableStreaming = false`
- `enableAISummary = false`
- `retainAudio = false`

### 4.2 绾︽潫鍏崇郴

- 褰?`enableStreaming = false` 鏃讹細
  - `enableAISummary` 鍦ㄧ晫闈笂涓嶅彲寮€鍚?  - 妗岄潰璋冮厤灞備笉寤虹珛娴佸紡杞綍閾捐矾

- 褰?`enableStreaming = true` 涓?`enableAISummary = true` 鏃讹細
  - 妗岄潰璋冮厤灞傛寜鏃堕棿绐楀彛瑙﹀彂 AI 鎽樿
  - 褰撳墠绐楀彛鏈熷彛寰勪负绾︽瘡 2 鍒嗛挓涓€娆?
## 5. 瀹炴椂杞綍椤?
### 5.1 鏁版嵁妯″瀷

寤鸿鏂板锛?
`RealtimeEntry`
- `id`
- `speaker`
- `text`
- `timestamp`
- `segments?`

`RealtimeSummary`
- `id`
- `createdAt`
- `text`

`RealtimeSessionState`
- `status: idle | recording | streaming | completed | error`
- `entries: RealtimeEntry[]`
- `summaries: RealtimeSummary[]`

### 5.2 鏁版嵁鏉ユ簮

瀹炴椂杞綍椤电殑鏁版嵁蹇呴』鏉ヨ嚜 `/stream`锛屼絾椤甸潰涓嶈兘鐩存帴娑堣垂鍘熷娴佷簨浠躲€?
娴佺▼锛?1. 鍚庣杈撳嚭 `/stream` 鍘熷缁撴灉
2. 妗岄潰璋冮厤灞傝В鏋愬苟鑱氬悎
3. 褰撲竴涓璇濅汉鐗囨瀹屾垚鍚庯紝鐢熸垚涓€鏉＄ǔ瀹氱殑 `RealtimeEntry`
4. 鍓嶇瀹炴椂杞綍椤佃拷鍔犲睍绀?
### 5.3 灞曠ず瑙勫垯

姣忔潯鐗囨鍙樉绀猴細
- 璇磋瘽浜哄悕
- 鏂囨湰
- 鏃堕棿鎴?
涓嶈姹傞€愬瓧鎵撳瓧鏈烘晥鏋溿€?
椤甸潰鐨勬牳蹇冧綋楠屾槸鈥滅墖娈佃惤鍦版椂闂寸嚎鈥濓紝涓嶆槸閫愬瓧婊氬姩妗嗐€?
### 5.4 AI 鎽樿

褰?`enableAISummary = true` 鏃讹細
- 妗岄潰璋冮厤灞傚畾鏈熷娴佸紡浼氳瘽鍐呭瑙﹀彂鎽樿
- 鎽樿鍐欏叆瀹炴椂杞綍椤垫憳瑕佸尯鍩?- 鍚屾椂鍐欏叆鍘嗗彶璁板綍璇︽儏

## 6. 鍘嗗彶璁板綍椤?
### 6.1 璁板綍绮掑害

鍘嗗彶璁板綍鎸夋暣娆′换鍔″瓨涓€鏉★紝涓嶆寜璇磋瘽浜烘媶鏉°€?
寤鸿鏁版嵁妯″瀷锛?
`HistoryRecord`
- `id`
- `createdAt`
- `mode: stream | non-stream`
- `text`
- `duration`
- `engine`
- `model`
- `speakerEntries`
- `summary`
- `retainAudio`
- `audioPath`

### 6.2 鏁版嵁鏉ユ簮

鍘嗗彶璁板綍闇€缁熶竴璁板綍涓ょ被浠诲姟锛?- 娴佸紡浠诲姟
- 闈炴祦寮忎换鍔?
瑕佹眰锛?- 褰撳惎鐢ㄦ祦寮忎紶杈撳悗锛屽巻鍙茶褰曡嚜鍔ㄦ敹闆?`stream` 涓?`non-stream`
- `stream` 鍙甫 AI 鎽樿
- `non-stream` 涓嶇敓鎴?AI 鎽樿

### 6.3 瀛樺偍鍙ｅ緞

鍘嗗彶璁板綍涓昏〃鐢卞悗绔淮鎶わ紝妗岄潰璋冮厤灞備笉鍐嶇洿鎺ユ壙鎷呮渶缁堣惤鐩樸€?
钀界洏浣嶇疆锛?- 搴斾綅浜庡悗绔繍琛屾椂鍙啓鐩綍
- 涓嶈兘渚濊禆瀹夎鐩綍鍙啓

寤鸿鍚庣瀛樺偍锛?- `history.json` 鎴栫瓑浠风粨鏋勫寲鏂囦欢
- 浠呬繚瀛樺厓鏁版嵁涓庢枃鏈?- 闊抽鏂囦欢鏄惁淇濈暀鐢?`retainAudio` 鍐冲畾

寤鸿鍚庣鎺ュ彛锛?- `GET /history`
- `POST /history`
- `DELETE /history/{record_id}`
- `DELETE /history`
- `GET /history/{record_id}/download/text`
- `GET /history/{record_id}/download/audio`

妗岄潰璋冮厤灞傝亴璐ｏ細
- 鍦ㄦ祦寮忓拰闈炴祦寮忎换鍔″畬鎴愭椂缁勭粐璁板綍骞惰皟鐢ㄦ柊澧炴帴鍙?- 鍦ㄩ〉闈腑璋冪敤鏌ヨ銆佸垹闄ゃ€佹竻绌恒€佷笅杞芥帴鍙?- 瀵规祦寮忕墖娈佃繘琛岃仛鍚堬紝鍐嶆彁浜ゆ暣娆′换鍔¤褰?
### 6.4 椤甸潰鑳藉姏

姣忔潯璁板綍蹇呴』鏀寔锛?- 澶嶅埗鏂囨湰
- 涓嬭浇鏂囨湰
- 涓嬭浇闊抽
- 鍒犻櫎鍗曟潯

椤甸潰蹇呴』鏀寔锛?- 娓呯┖鍏ㄩ儴璁板綍

濡傛灉 `retainAudio = false` 鎴栬褰曟棤闊抽锛?- 鈥滀笅杞介煶棰戔€濇寜閽鐢ㄦ垨鏄庣‘鎻愮ず涓嶅彲鐢?
## 7. 蹇嵎閿綍鍒跺姛鑳?
### 7.1 鏁版嵁妯″瀷

寤鸿鏂板褰曞埗鎬侊細

`HotkeyCaptureState`
- `idle`
- `recording`
- `captured`
- `saving`
- `error`

### 7.2 琛屼负

浜や簰娴佺▼锛?1. 鐢ㄦ埛鐐瑰嚮鈥滃綍鍒跺揩鎹烽敭鈥?2. 鐣岄潰杩涘叆鐩戝惉鐘舵€?3. 妗岄潰璋冮厤灞傛崟鑾风湡瀹炴寜閿?4. 瑙勮寖鍖栦负鏄剧ず鍊间笌瀛樺偍鍊?5. 鍓嶇棰勮缁撴灉
6. 鐢ㄦ埛纭淇濆瓨鎴栭噸鏂板綍鍒?
### 7.3 鑳藉姏瑕佹眰

- 鏀寔鍗曢敭
- 鏀寔缁勫悎閿?- 鍖哄垎宸﹀彸 `Alt`
- 涓嶅啀渚濊禆鎵嬪伐杈撳叆 keycode

### 7.4 瀛樺偍

鐜版湁璁剧疆椤瑰彲缁х画淇濈暀锛?- `hotkeyModifiers`
- `hotkeyKeyCode`

濡傞渶鏀寔宸﹀彸淇グ閿簿缁嗗尯鍒嗭紝闇€琛ュ厖鏇村畬鏁寸殑閿綅鎻忚堪瀛楁锛屼緥濡傦細
- `hotkeyPrimaryKey`
- `hotkeyModifiersDetailed`
- `hotkeyDisplay`

## 8. 椤甸潰鏍峰紡瑕佹眰

### 8.1 瀹炴椂杞綍椤?
- 閲囩敤鏃堕棿绾垮紡鍗曞垪甯冨眬
- 鐗囨鍗＄墖搴旇交閲忥紝涓嶅仛鍘氶噸鍗＄墖鍫嗗彔
- 鎽樿鍖哄煙涓庣墖娈靛尯鍒嗗眰锛屼絾浠嶄繚鎸佸崟灞備富琛ㄩ潰椋庢牸

### 8.2 鍘嗗彶璁板綍椤?
- 宸︿晶鎴栭《閮ㄥ彲鎻愪緵杞婚噺绛涢€夛細鍏ㄩ儴 / 娴佸紡 / 闈炴祦寮?- 涓诲垪琛ㄤ紭鍏堟樉绀轰换鍔℃瑙?- 璇︽儏鍖哄睍绀哄叏鏂囥€佽璇濅汉鐗囨銆佹憳瑕佷笌涓嬭浇鎿嶄綔

### 8.3 蹇嵎閿〉

- 褰曞埗鎺т欢搴旀槑鏄炬浛浠ｅ師鏁板瓧杈撳叆妗?- 褰撳墠蹇嵎閿樉绀哄簲绐佸嚭
- 璇存槑鍖哄簲淇濈暀锛屼絾鍘嬬缉鍒板師鐢熻缃〉瀵嗗害

## 9. 娴嬭瘯绛栫暐

### 9.1 鎴戝彲浠ユ墽琛岀殑娴嬭瘯

- 鏁版嵁妯″瀷涓庣姸鎬佸眰鏋勫缓楠岃瘉
- `npm run build`
- `cargo check`
- `/stream` 妗ユ帴閫昏緫娴嬭瘯
- 鍘嗗彶璁板綍鎸佷箙鍖栥€佸垹闄ゃ€佹竻绌恒€佸鍑烘祴璇?- 蹇嵎閿綍鍒剁姸鎬佹満浠ｇ爜娴嬭瘯

### 9.2 闇€瑕佷汉宸ラ獙鏀剁殑娴嬭瘯

- 瀹炴椂杞綍椤靛疄闄呮晥鏋?- AI 鎽樿鑺傚涓庡彲璇绘€?- 鍘嗗彶璁板綍鎿嶄綔浣撻獙
- 蹇嵎閿綍鍒剁湡瀹為敭鐩樹綋楠?- 宸﹀彸 `Alt` 鍖哄垎鏄惁绗﹀悎棰勬湡

### 9.3 鏂囨。瑙勫垯

娌℃湁鍐欒繘 [绗竴闃舵娴嬭瘯.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\绗竴闃舵娴嬭瘯.md) 鐨勶紝涓€寰嬭涓烘病娴嬨€?
## 10. 鍥炲啓涓绘枃妗ｈ姹?
鏈笓棰樺畬鎴愬悗锛屽繀椤诲洖鍐欙細
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-26-implementation-gap-checklist.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-26-implementation-gap-checklist.md)

鍥炲啓鍐呭鑷冲皯鍖呮嫭锛?- 鏂板涓撻绱㈠紩
- 椤甸潰鎵╁睍
- 鏂板璁剧疆椤?- 鏂板娴嬭瘯涓庨獙鏀堕」
