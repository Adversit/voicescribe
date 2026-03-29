# 2026-03-25 Session Bug Log

## 32. 热键端到端已触发，但录音启动因设备流配置不受支持而失败
- 表现：双击 `Ctrl+Shift+R` 后，Rust 端已记录 `emit_event delivered_to=main`，前端也已记录 `frontend received hotkey-start-recording` 与 `frontend beginRecordingSession start`，但最终 `startRecording` 失败，错误为 `The requested stream configuration is not supported by the device.`。
- 原因：热键桥接链路已经恢复，当前阻塞点转移到录音设备能力协商；现有 `audio.rs` 对输入设备的采样率/声道/样本格式选择仍有兼容性缺口。
- 处理：先把该问题记为新的录音链路兼容性 bug；后续需要针对当前麦克风设备补充更稳健的 CPAL 配置回退策略，再继续做热键真实录音验收。

## 31. 鍓嶇 `plugin:event|listen` 琚?ACL 鎷掔粷锛屽鑷寸儹閿簨浠舵ˉ鎺ュ湪鐩戝惉娉ㄥ唽闃舵鐩存帴鏂摼
- 琛ㄧ幇锛歊ust 浣庡眰 hook 宸茬粡鑳借褰?`emit_event hotkey-start-recording`锛屼絾鍓嶇鍚姩鍚庨┈涓婅褰?`bind hotkey listeners failed: Command plugin:event|listen not allowed by ACL`锛岀敤鎴蜂晶琛ㄧ幇浠嶇劧鏄€滄寜涓嬪畬鍏ㄦ病鍙嶅簲鈥濄€?- 鍘熷洜锛歚main` 绐楀彛缂哄皯鏄惧紡 capability锛屽鑷?Tauri v2 鐨?`core:event:listen` 娌℃湁鎺堜簣鍒板墠绔?webview锛涙鍓嶉棶棰樺張琚墠绔己灏戠洃鍚敞鍐屽け璐ユ棩蹇楄繘涓€姝ユ斁澶с€?- 澶勭悊锛氭柊澧?`tauri-app/src-tauri/capabilities/main.json`锛屼负 `main` 绐楀彛鏄惧紡鎺堜簣 `core:default`銆乣store:default`銆乣autostart:default` 涓?`clipboard-manager:allow-write-text`锛屽苟灏嗙儹閿?/ 鎵樼洏鐩戝惉鏀逛负 `WebviewWindow` 瀹氬悜鐩戝惉銆?
## 30. Rust 宸插彂鍑虹儹閿簨浠讹紝浣嗗墠绔湭鏀跺埌锛岃鏄庝簨浠舵ˉ鎺ョ洰鏍囦粛鏈夋涔?- 琛ㄧ幇锛歭ow-level keyboard hook 宸茬粡璁板綍 `matches_hotkey` 鍜?`emit_event hotkey-start-recording`锛屼絾鍓嶇鐩戝惉鍏ュ彛娌℃湁瀵瑰簲鏃ュ織锛岀敤鎴蜂晶琛ㄧ幇涓衡€滄寜涓嬪畬鍏ㄦ病鍙嶅簲鈥濄€?- 鍘熷洜锛氬綋鍓嶅疄鐜颁緷璧?`app.emit(...)` + 鍓嶇閫氱敤 `listen(...)` 鐨勫鐩爣鍖归厤锛岀儹閿簨浠跺疄闄呭彧闇€瑕佸彂缁?`main` 绐楀彛锛涗竴鏃︾洰鏍囧尮閰嶃€佺洃鍚敞鍐屾椂鏈烘垨鐩戝惉娉ㄥ唽澶辫触琚潤榛樺悶鎺夛紝灏变細鍑虹幇鈥淩ust 宸茶Е鍙戙€佸墠绔棤鎰熺煡鈥濈殑鏂摼銆?- 澶勭悊锛氭妸鐑敭 / 鎵樼洏 / 闊抽鐘舵€佷簨浠剁粺涓€鏀跺彛涓衡€淩ust 瀹氬悜鍙戠粰 `main` 绐楀彛锛屽墠绔湪褰撳墠绐楀彛瀹氬悜鐩戝惉鈥濓紝骞惰ˉ涓婂墠绔洃鍚敞鍐屽け璐ョ殑鏄惧紡鏃ュ織涓庢彁绀猴紝閬垮厤鍐嶆鍑虹幇闈欓粯鏂摼銆?
鏇存柊鏃堕棿锛?026-03-28

鏈枃妗ｈ褰曟湰娆′細璇濅腑锛岀敱鐢ㄦ埛鎸囧嚭銆佽€岄潪棣栨瀹炵幇鍗虫纭畬鎴愮殑闂銆?
## 1. Cargo 鍦ㄧ粓绔腑涓嶅彲鐢?- 琛ㄧ幇锛歚cargo --version` 鍦?PowerShell 涓姤 `CommandNotFoundException`銆?- 鍘熷洜锛歊ust 宸插畨瑁咃紝浣嗗綋鍓?PowerShell 浼氳瘽鐨?`PATH` 娌℃湁鍖呭惈 Rust 瀹夎鐩綍銆?- 澶勭悊锛氶€氳繃涓存椂琛?PATH銆佸畨瑁?MSVC Build Tools銆佽ˉ PowerShell profile 瑙ｅ喅銆?
## 2. 閲嶅惎鍚庣晫闈㈡病鏈夋洿鏂?- 琛ㄧ幇锛氫唬鐮佸凡淇敼锛屼絾妗岄潰搴旂敤鐣岄潰娌℃湁鍙樺寲銆?- 鍘熷洜锛氭棫杩涚▼娌℃湁瀹屽叏娓呯悊锛岀湅鍒扮殑涓嶆槸鏈€鏂版瀯寤轰骇鐗┿€?- 澶勭悊锛氳ˉ寮洪噸鍚祦绋嬶紝鍏堟竻鐞嗘棫妗岄潰绔€佹棫 Python 鍚庣鍜岀鍙ｅ崰鐢紝鍐嶅惎鍔ㄦ柊鐗堟湰銆?
## 3. 搴旂敤娌℃湁鏈€灏忓寲鍒版墭鐩?- 琛ㄧ幇锛氬叧闂富绐楀彛鏃舵病鏈夎繘鍏ユ墭鐩樸€?- 鍘熷洜锛氭渶鍒濆彧瀹屾垚浜嗙獥鍙ｅ惎鍔紝娌℃湁琛ュ畬鏁寸殑鍏抽棴杞墭鐩橀€昏緫銆?- 澶勭悊锛氳ˉ鍏ㄦ墭鐩樿彍鍗曘€佸叧闂殣钘忋€佹墭鐩樻仮澶嶄富绐楀彛閫昏緫銆?
## 4. 鎵樼洏娌℃湁鍥炬爣
- 琛ㄧ幇锛氭墭鐩樻湁琛屼负浣嗘病鏈夋樉绀哄浘鏍囥€?- 鍘熷洜锛氭墭鐩橀€昏緫鍏堝畬鎴愶紝浣嗗浘鏍囪祫婧愭病鏈夋纭粦瀹氥€?- 澶勭悊锛氳ˉ鍏呮墭鐩樺浘鏍囪祫婧愮粦瀹氫笌閰嶇疆銆?
## 5. FunASR 妯″瀷鍒楄〃鍓嶅悗绔彛寰勪笉涓€鑷?- 琛ㄧ幇锛氬紩鎿庨〉涓?FunASR 鐨勨€滃彲閫夋ā鍨嬧€濆拰鈥滃彲涓嬭浇妯″瀷鈥濇暟閲忎笉涓€鑷淬€?- 鍘熷洜锛歚/engines` 涓?`/models` 鐨勬ā鍨嬫竻鍗曟病鏈夌粺涓€鏉ユ簮銆?- 澶勭悊锛氱粺涓€ FunASR 妯″瀷鍒楄〃锛屽苟璁╁墠鍚庣鍩轰簬鍚屼竴妯″瀷娓呭崟娓叉煋銆?
## 6. 鏈湴 `models/` 鐩綍娌℃湁琚纭瘑鍒?- 琛ㄧ幇锛氶」鐩牴鐩綍宸叉湁妯″瀷锛屼絾绯荤粺鏈樉绀轰负宸蹭笅杞姐€?- 鍘熷洜锛氭闈㈢鏇捐鍙栧叾浠栬繍琛屾椂鐩綍锛屼笖娉ㄥ唽琛ㄤ腑淇濈暀鏃х粷瀵硅矾寰勩€?- 澶勭悊锛氱粺涓€鏀跺彛鍒伴」鐩牴鐩綍 `models/`锛屽苟澧炲姞鏃ц矾寰?rebasing銆?
## 7. 妯″瀷鐩綍鍙ｅ緞涓嶇粺涓€
- 琛ㄧ幇锛氱郴缁熷苟闈炰弗鏍煎彧璁ら」鐩牴鐩綍 `models/`銆?- 鍘熷洜锛氬悗绔厤缃€佹闈㈢鍚姩鍙傛暟鍜屾敞鍐岃〃璺緞娌℃湁瀹屽叏鏀跺彛銆?- 澶勭悊锛氭槑纭彛寰勪负鈥滀笅杞藉埌 `models/`銆佽鍙栦篃鍙粠 `models/`銆佹棫璺緞 rebasing 鍒板綋鍓?`models/`鈥濄€?
## 8. 鍘熸湁鈥滄湭涓嬭浇妯″瀷灞曠ず + 涓嬭浇鍏ュ彛鈥濆姛鑳戒涪澶?- 琛ㄧ幇锛氬紩鎿庨〉鍙樉绀哄凡涓嬭浇妯″瀷锛屾病鏈夋樉绀烘湭涓嬭浇妯″瀷锛屼篃娌℃湁涓嬭浇鍏ュ彛銆?- 鍘熷洜锛氱涓€娆′慨妯″瀷椤垫椂鍙榻愪簡宸蹭笅杞界姸鎬侊紝娌℃湁淇濈暀瀹屾暣妯″瀷娓呭崟琛ュ叏閫昏緫銆?- 澶勭悊锛氬墠绔敼涓哄厛鍙栧畬鏁存ā鍨嬫竻鍗曪紝鍐嶅彔鍔犵姸鎬侊紝鏈笅杞芥ā鍨嬮粯璁ゆ樉绀轰负鈥滄湭涓嬭浇鈥濄€?
## 9. 鍙湁 FunASR 鍋氫簡瀹屾暣妯″瀷鐘舵€佽ˉ鍏?- 琛ㄧ幇锛欶unASR 鑳芥樉绀烘湭涓嬭浇鐘舵€侊紝浣嗗叾浠栧紩鎿庢病鏈夊悓鏍疯涓恒€?- 鍘熷洜锛氬墠绔綋鏃跺彧缁?`funasr` 鍋氫簡鐗瑰垽銆?- 澶勭悊锛氬幓鎺夊墠绔 FunASR 鐨勭壒鍒わ紝鏀逛负鎵€鏈夊紩鎿庣粺涓€鎸夊畬鏁存ā鍨嬫竻鍗曡ˉ鍏ㄧ姸鎬併€?
## 10. 鍏朵粬寮曟搸娌℃湁涓嬭浇鍜屽垹闄ら€昏緫
- 琛ㄧ幇锛歐hisper銆乄hisperCpp銆丳arakeet 娌℃湁涓?FunASR 涓€鏍风殑涓嬭浇鍜屽垹闄よ兘鍔涖€?- 鍘熷洜锛氬悗绔?`/models/download` 鍜?`/models/delete` 璧峰垵鍙敮鎸?FunASR銆?- 澶勭悊锛氭墿灞曞悗绔ā鍨嬬姸鎬佷笌涓嬭浇鍒犻櫎閫昏緫锛岃鐩栨墍鏈夊紩鎿庛€?
## 11. 妯″瀷鍒犻櫎鍚?`/models` 浠嶆畫鐣欎笂娆?`downloaded_bytes`
- 琛ㄧ幇锛氭ā鍨嬫枃浠跺凡鍒犻櫎锛宍available=false`锛屼絾 `/models` 浠嶄繚鐣欐棫鐨?`downloaded_bytes`銆?- 鍘熷洜锛氬垹闄ゆā鍨嬫椂鍙竻鐞嗕簡娉ㄥ唽琛ㄥ拰鏂囦欢锛屾病鏈夊悓姝ユ竻绌哄唴瀛樹腑鐨勪笅杞界姸鎬併€?- 澶勭悊锛氬湪 `backend/server.py` 鍒犻櫎閫昏緫涓ˉ浜嗕笅杞界姸鎬侀噸缃€?
## 12. 鏈湴鍚姩鑴氭湰璇敤 `tauri build` 瀵艰嚧 NSIS 閿佷綇鍙墽琛屾枃浠?- 琛ㄧ幇锛氭湰鍦板惎鍔ㄦ椂鍦?NSIS bundling 闃舵鎶?`os error 32`銆?- 鍘熷洜锛氭湰鍦扳€滈噸寤哄苟鍚姩搴旂敤鈥濆満鏅鐢ㄤ簡 `npm run tauri:build`銆?- 澶勭悊锛氭妸 `scripts/start_windows_system.bat` 鏀规垚鏈湴鍚姩鑴氭湰锛屼笉鍐嶈蛋 NSIS 鎵撳寘銆?
## 13. 鏈湴鍚姩鑴氭湰鏀规垚 `cargo build --release` 鍚庨€€鍥?`localhost` 椤甸潰
- 琛ㄧ幇锛氭闈㈠簲鐢ㄥ惎鍔ㄥ悗鏄剧ず `ERR_CONNECTION_REFUSED` 鐨?localhost 椤甸潰銆?- 鍘熷洜锛氱函 `cargo build --release` 娌℃湁璧板畬鏁寸殑 Tauri release 鏋勫缓璇箟銆?- 澶勭悊锛氭敼涓?`npx tauri build --no-bundle --ci`銆?
## 14. `tauri-plugin-store` JS API 棣栨鎺ュ叆鏃惰鐢ㄤ簡鏋勯€犲嚱鏁?- 琛ㄧ幇锛歚npm run build` 澶辫触锛孴ypeScript 鎶?`Store` 鏋勯€犲櫒绉佹湁銆?- 鍘熷洜锛氳鍐欐垚 `new Store(...)`銆?- 澶勭悊锛氭敼涓?`Store.load(...)`銆?
## 15. `lib.rs` 琚敊璇紪鐮佸啓鍥烇紝瀵艰嚧 `cargo check` 澶辫触
- 琛ㄧ幇锛歊ust 鎶?`stream did not contain valid UTF-8`銆?- 鍘熷洜锛氱敤閿欒缂栫爜閲嶅啓浜?`lib.rs`銆?- 澶勭悊锛氭寜 UTF-8 閲嶆柊鍐欏洖 `lib.rs`銆?
## 16. JSON 閰嶇疆鏂囦欢琚啓鎴愬甫 BOM 鐨?UTF-8
- 琛ㄧ幇锛歚package.json` 涓?`tauri.conf.json` 鍚屾椂瑙ｆ瀽澶辫触銆?- 鍘熷洜锛氶噸鍐?JSON 鏂囦欢鏃跺啓鎴愪簡甯?BOM 鐨?UTF-8銆?- 澶勭悊锛氭敼涓烘棤 BOM UTF-8銆?
## 17. 鎵樼洏浜嬩欢妗ユ帴鍚?`cargo check` 鍥犵己灏?`Emitter` trait import 澶辫触
- 琛ㄧ幇锛歊ust 鎶?`no method named emit found for reference &AppHandle`銆?- 鍘熷洜锛氭柊澧?`app.emit(...)` 鏃舵湭瀵煎叆 `tauri::Emitter`銆?- 澶勭悊锛氳ˉ榻?import銆?
## 18. 褰曢煶鎮诞绐楃獥鍙ｅ寲鎺ョ嚎鏃惰鍒や簡 Tauri builder API 杩斿洖绫诲瀷
- 琛ㄧ幇锛歚cargo check` 棣栨澶辫触銆?- 鍘熷洜锛歚icon(...)` 杩斿洖 `Result`锛屼互鍙?`setup` 涓?`App` / `AppHandle` 浣跨敤涓嶅尮閰嶃€?- 澶勭悊锛氳ˉ `?` 浼犳挱骞剁粺涓€浼犻€?`app.handle()`銆?
## 19. Tauri unit 鍨嬫彃浠惰閿欒鍐欐垚 `{}` 閰嶇疆锛屽鑷?release 鍚姩 panic
- 琛ㄧ幇锛歳elease 绋嬪簭鍚姩鍗冲紓甯搁€€鍑恒€?- 鍘熷洜锛歚tauri.conf.json` 涓妸鏃犻厤缃彃浠跺啓鎴愪簡瀵硅薄銆?- 澶勭悊锛氭竻鐞嗕笉闇€瑕佺殑鎻掍欢閰嶇疆瀵硅薄銆?
## 20. 鐣岄潰婧愮爜涓枃鐪嬩技姝ｅ父锛屼絾鍓嶇 bundle 瀹為檯宸茬粡涔辩爜
- 琛ㄧ幇锛氱晫闈腑鏂囨樉绀轰负涔辩爜銆?- 鍘熷洜锛氭鍓嶉€氳繃 PowerShell 閲嶅啓鏂囦欢鏃舵病鏈夊己鍒舵棤 BOM UTF-8锛屽鑷存瀯寤轰骇鐗╁甫鍏ラ敊璇紪鐮佹枃鏈€?- 澶勭悊锛氱粺涓€鎸?UTF-8 鏃?BOM 閲嶅啓鍓嶇鐣岄潰鏂囦欢骞堕噸鏂版瀯寤恒€?
## 21. 涓荤獥鍙ｈ瀹炵幇鎴愨€滃簳鏉?+ 涓棿澹斥€濈殑缃戦〉寮忓弻灞傜粨鏋?- 琛ㄧ幇锛氱獥鍙ｆ斁澶у悗鑳界湅鍒版槑鏄剧殑搴曞眰鑳屾櫙鏉匡紝閫氱敤椤典篃鍋?dashboard 椋庢牸銆?- 鍘熷洜锛歚Layout.tsx` 鍜屽叏灞€鏍峰紡鐢ㄤ簡閿欒鐨?shell/panel 甯冨眬妯″瀷銆?- 澶勭悊锛氭妸甯冨眬妯″瀷鏀规垚鈥滃崟灞備富琛ㄩ潰 + 渚ц竟鏍忓浐瀹?+ 鍐呭鎵╁睍鈥濓紝骞舵妸閫氱敤椤垫敹鍥炲崟鍒?`Form + Section` 椋庢牸銆?
## 22. Windows PowerShell 鐨勯粯璁よ鍙栨柟寮忚瀵间簡缂栫爜鍒ゆ柇
- 琛ㄧ幇锛歚Get-Content` 鐪嬪埌鐨勬槸 `闁氨鏁 涓€绫讳贡鐮侊紝瀵艰嚧璇互涓烘簮鐮佷粛鐒舵崯鍧忋€?- 鍘熷洜锛歐indows PowerShell 瀵?UTF-8 鏂囦欢鐨勬樉绀哄拰姝ゅ墠鐨勬贩鍚堢紪鐮佹枃浠朵竴璧烽€犳垚浜嗚鍒わ紱鍚屾椂鐪熸鎹熷潖鐨勬枃妗ｆ枃浠朵笌宸茬粡淇濂界殑婧愮爜鏂囦欢娣峰湪涓€璧枫€?- 澶勭悊锛氭敼鐢?Python 鎸?`utf-8` 鐩存帴鏍￠獙鏂囦欢鍐呭锛岀‘璁ゆ簮鐮佷笌鏂版枃妗ｅ凡鎭㈠姝ｅ父锛涘浠嶆崯鍧忕殑鏂囨。鏂囦欢鎵ц鏁存枃浠堕噸鍐欍€?
## 23. `backend/server.py` 鍦ㄥ疄鏃惰浆褰曚笓棰樺紑鍙戜腑鍑虹幇缂栫爜姹℃煋
- 琛ㄧ幇锛氫负 `/history`銆乣/summary`銆乣/stream` 琛ラ€昏緫鍚庯紝`py_compile` 鎶ラ敊锛屾枃浠朵腑娣峰叆涓嶅彲瑙佸瓧绗︿笌绉佹湁鍖哄瓧绗︺€?- 鍘熷洜锛氬湪 Windows 鐜涓嬪娆″眬閮ㄦ敼鍐欏悓涓€澶ф枃浠舵椂锛屽巻鍙叉贩鍚堢紪鐮侀棶棰樿鏀惧ぇ锛岀户缁眬閮ㄤ慨琛ヤ細杩炲甫鐮村潖 docstring 涓庡嚱鏁颁綋銆?- 澶勭悊锛氫粠 `git show HEAD:backend/server.py` 鎭㈠鍩虹嚎锛屽啀閲嶆柊鏁村潡琛ュ洖鍘嗗彶璁板綍銆佹憳瑕佷笌瀹炴椂娴侀€昏緫锛屽苟閲嶆柊璺戠紪璇戜笌鎺ュ彛鐑熸祴銆?
## 24. `/stream` 鐨勫師濮嬮煶棰戝绾︽渶鍒濆鐞嗛敊璇?- 琛ㄧ幇锛氭棭鏈熷疄鐜版妸鍓嶇鍙戦€佺殑鍘熷 PCM 鐩存帴褰撴垚 `.wav` 鏂囦欢澶勭悊锛屾祦寮忚浆褰曢摼璺湪鐪熷疄闊抽鍧椾笅涓嶇ǔ瀹氥€?- 鍘熷洜锛氬墠鍚庣鏈€鍒濇病鏈夌粺涓€鈥淩ust 鍙戜粈涔堛€佸悗绔寜浠€涔堟牸寮忚浆褰曗€濈殑浜岃繘鍒堕煶棰戝绾︺€?- 澶勭悊锛歊ust 渚?`audio.rs` 缁熶竴鍙?base64 PCM 闊抽鍧楋紱鍓嶇瀹炴椂娴佹ˉ鎺ユ寜鍧楀彂閫侊紱鍚庣閫氳繃 `_write_pcm16_wav()` 鎶?PCM 鍖呰鎴愬悎娉?WAV 鍐嶈繘鍏ヨ浆褰曢摼璺€?
## 25. 蹇嵎閿綍鍒舵甯革紝浣嗗簲鐢ㄥ惎鍔ㄥ悗瀹為檯瑙﹀彂浠嶆部鐢ㄦ棫缁戝畾鎴栭粯璁ょ粦瀹?- 琛ㄧ幇锛氬揩鎹烽敭璁剧疆椤靛彲浠ユ纭綍鍒跺苟灞曠ず鐪熷疄鎸夐敭锛屼絾搴旂敤鍚姩鍚庡疄闄呯敤浜庡紑濮嬪綍闊崇殑鐑敭鍙兘浠嶆槸鏃х粦瀹氭垨榛樿缁戝畾锛屽鑷粹€滃綍鍒舵甯搞€佸惎鍔ㄩ敊璇€濄€?- 鍘熷洜锛氭寔涔呭寲鐨?`hotkeyBinding` 鍙湪璁剧疆椤电偣鍑烩€滃簲鐢ㄥ揩鎹烽敭鈥濇椂娉ㄥ唽鍒?Rust 鐑敭鐩戝惉鍣紱璁剧疆姘村悎鍜屽簲鐢ㄥ惎鍔ㄥ悗娌℃湁鑷姩閲嶆柊娉ㄥ唽褰撳墠缁戝畾銆?- 澶勭悊锛氬湪鍓嶇鍚姩閾句腑琛ヤ笂鈥滆缃按鍚堝畬鎴愬悗鑷姩娉ㄥ唽褰撳墠 `hotkeyBinding`鈥濈殑閫昏緫锛屽苟瀵硅閾捐矾琛ユ瀯寤哄洖褰掗獙璇併€?
## 26. Rust 鐑敭鐩戝惉瀹夎澶辫触鏃惰鍚炴帀锛屽墠绔浠ヤ负宸叉敞鍐屾垚鍔?- 琛ㄧ幇锛氬嵆浣垮墠绔凡鍙戦€佹敞鍐岃姹傦紝鎸変笅蹇嵎閿粛鐒跺畬鍏ㄦ棤鍙嶅簲锛岀湅璧锋潵鍍忊€滃悗绔病鍙嶅簲鈥濄€?- 鍘熷洜锛歚hotkey.rs` 涓?`SetWindowsHookExW(WH_KEYBOARD_LL, ...)` 澶辫触鍚庤 `unwrap_or_default()` 鍚炴帀锛屽鑷?hook 瀹為檯鏈畨瑁咃紝浣嗗懡浠ゅ眰浠嶈繑鍥炴垚鍔熴€?- 澶勭悊锛氭敼涓烘樉寮忔鏌?hook 瀹夎缁撴灉锛屾敞鍐屽け璐ョ洿鎺ヨ繑鍥為敊璇粰鍓嶇锛屼笉鍐嶉潤榛橀檷绾э紱鍚屾椂琛ヤ笂鍚姩闃舵鐨勬瀯寤哄洖褰掗獙璇併€?
## 27. `start_windows_system.bat` 鏈湡姝ｉ噸鍚棫鍚庣
- 琛ㄧ幇锛氭墽琛?`scripts/start_windows_system.bat` 鍚庢闈㈢浼氶噸鍚紝浣嗘棫 Python 鍚庣鍙兘缁х画瀛樻椿锛屽鑷存柊鍓嶇浠嶈繛鍒版棫鍚庣杩涚▼銆?- 鍘熷洜锛氳剼鏈綋鍓嶅彧鎸夎緝绐勭殑 `Win32_Process` 鏉′欢娓呯悊 `python.exe`锛屾病鏈夎鐩?`pythonw.exe` / 绔彛鍗犵敤鍦烘櫙锛屼篃娌℃湁鏍￠獙 `8765` 绔彛鏄惁鐪熺殑閲婃斁銆?- 澶勭悊锛氳ˉ寮鸿剼鏈殑鍚庣娓呯悊閫昏緫锛屾寜杩涚▼鍛戒护琛屽拰 8765 绔彛鍙岄噸鍏滃簳鍋滄娈嬬暀杩涚▼锛屽苟鍦ㄥ惎鍔ㄥ墠鏄惧紡绛夊緟绔彛閲婃斁銆?
## 28. `start_windows_system.bat` 涓唴宓?PowerShell 鍛戒护杞箟涓嶇ǔ锛屽鑷存竻鐞嗛樁娈佃澶辫触
- 琛ㄧ幇锛氳剼鏈湪娓呯悊鍚庣闃舵鎶?`The ampersand (&) character is not allowed`锛屽苟浼撮殢 `Input redirection is not supported`锛屽鑷撮噸鍚摼璺腑鏂€?- 鍘熷洜锛歚cmd` 涓祵濂?`powershell -Command "^& { ... }"` 鐨勮浆涔夊舰寮忎笉绋筹紝瀹為檯鎵ц鏃惰閿欒瑙ｆ瀽銆?- 澶勭悊锛氭敼涓轰笉渚濊禆 `^& { ... }` 鍖呰９鐨勭洿鎺?PowerShell 鍛戒护鍐欐硶锛屼繚鎸佽剼鏈湪 `cmd` 涓嬪彲绋冲畾鎵ц銆?
## 29. 妗岄潰绔己灏戝彲瑙佹棩蹇楀嚭鍙ｏ紝瀵艰嚧鐑敭闂闅句互瀹氫綅
- 琛ㄧ幇锛氬綋鍓嶅惎鍔ㄩ摼鍙樉寮忔毚闇插悗绔粓绔紝Rust 灞傚拰鍓嶇灞傜殑鐑敭娉ㄥ唽/瑙﹀彂鏃ュ織鐢ㄦ埛渚т笉鍙锛岄亣鍒扳€滄寜涓嬪畬鍏ㄦ病鍙嶅簲鈥濇椂闅句互鍒ゆ柇鍗″湪鍝竴灞傘€?- 鍘熷洜锛氭闈㈢浠?GUI 鏂瑰紡鍚姩锛屾病鏈夋帶鍒跺彴杈撳嚭鎵胯浇锛涘悓鏃剁幇鏈夌儹閿摼璺己灏戠嫭绔嬫枃浠舵棩蹇椼€?- 澶勭悊锛氫负鐑敭娉ㄥ唽銆乭ook 瀹夎鍜屼簨浠跺彂灏勯摼璺ˉ鏈€灏忔枃浠舵棩蹇楋紝浼樺厛瀹氫綅鈥滄湭娉ㄥ唽 / 鏈Е鍙?/ 宸茶Е鍙戜絾鏈敓鏁堚€濈殑鍏蜂綋灞傜骇銆?
## 澶囨敞
- 鏈枃妗ｈ褰曠殑鏄€滄湰娆′細璇濅腑鐢辩敤鎴锋寚鍑虹殑闂鈥濓紝涓嶆槸瀹屾暣缂洪櫡娓呭崟銆?- 鍚庣画濡傛灉鍐嶅嚭鐜扳€滄病鏈変竴娆″仛瀵光€濈殑闂锛屽簲缁х画鎶婂師鍥犲拰淇缁撴灉杩藉姞鍒版湰鏂囦欢銆?
## 33. 说话人分离 / 识别模型加载职责不够显式，难以证明模型已实际使用
- 表现：当前后端同时存在 FunASR 内置 speaker 标签、SpeakerDiarizer.load()、
egister_speaker()、ssign_speakers() 多条路径，但日志不足以明确区分转录模型、说话人分离模型、说话人识别模型分别何时加载、是否真的用到。
- 原因：server.py 把说话人相关链路放在 	ranscribe / 
egister_speaker 的分支里隐式触发，SpeakerDiarizer.load() 也会一次性拉起多个模型，导致职责耦合、验证困难。
- 处理：本轮改为显式加载链路，并补足日志与验证，确保“模型可用”与“模型已实际加载并参与处理”可以被区分。
## 34. Windows 下 torch 运行时 DLL 初始化失败，导致 FunASR / 说话人模型“包存在但不可加载"
- 表现：/health 仍显示 
unasr=true、diarization=true，但实际调用 /speakers/register 时在 
rom funasr import AutoModel 阶段失败，异常为 WinError 1114，指向 	orch\\lib\\c10.dll 初始化失败。
- 影响：转录模型、说话人分离模型、说话人识别模型都无法完成真实加载；现有可用性判断过于乐观。
- 处理：本轮补充 Windows 运行时探测、健康状态暴露、异常日志，并继续收口 Python / torch 依赖链后再做真实模型验收。

## 35. 外部分离模型不能用 funasr.AutoModel 直接加载，且 Windows 非 16k 输入会触发 torchaudio sox 限制
- 表现：iic/speech_campplus_speaker-diarization_common 与 damo/speech_diarization_sond-zh-cn-alimeeting-16k-n16k4-pytorch 用 AutoModel 加载时会报 is not registered；改走 modelscope pipeline 后，22050Hz 输入又会在 Windows 下触发 sox extension is not supported on Windows。
- 影响：外部分离链路虽然有模型资源，但原实现路径不正确，且输入预处理缺失。
- 处理：切换到 modelscope segmentation-clustering pipeline，并在 Windows 侧先把输入转换为 16kHz / mono wav 后再执行外部分离。

## 36. modelscope 依赖未写入 requirements，导致外部分离 pipeline 初始化时连续缺包
- 表现：将外部分离切换到 modelscope pipeline 后，初始化过程中依次缺少 ddict、datasets、pillow、simplejson、sortedcontainers、hdbscan。
- 影响：外部分离模型资源虽然存在，但新环境按 
equirements.txt 安装后仍无法完成 pipeline 初始化。
- 处理：已把这些依赖补入 ackend/requirements.txt，并在本机 venv 中完成安装验证。

## 37. Whisper 转录模型在 Windows 运行时发生 native 崩溃，导致连接被服务端重置
- 表现：对 `/transcribe` 发送 `engine=whisper`、`model=base`、`enable_diarization=true` 的请求时，客户端收到 `ConnectionResetError(10054)`；进一步脱离 API 直接执行 `WhisperEngine().load('base').transcribe(...)`，Python 进程直接退出，退出码为 `-1073741819`。
- 影响：当前默认启动链上只能确认 FunASR 转录模型可稳定加载和使用，Whisper 路径尚不能作为稳定的转录回退链路，也无法继续借它验证 “API 内外部分离” 这一分支。
- 定位：问题已从 API 分支收敛到 `faster-whisper / ctranslate2` 运行时本身，和外部分离逻辑无关；后续需要单独检查 Windows 下的 ctranslate2 依赖、模型下载内容与 CPU 指令集兼容性。

## 38. Whisper Windows 崩溃已通过 openai-whisper 回退链路收口
- 处理：在 `backend/engines/whisper_engine.py` 中将 Windows 默认实现切到 `openai-whisper`，并改为使用 `soundfile + scipy` 直接读取音频数组，绕开 `ffmpeg` 依赖与 `faster-whisper / ctranslate2` 的 native 崩溃点。
- 验证：`WhisperEngine().load('base').transcribe(...)` 已可稳定执行；默认 8765 后端的 `engine=whisper` + `enable_diarization=true` 也已成功返回结果，并在 `/health` 中显示 `loaded_engines.whisper` 与 `speaker_runtime.diarization_loaded=true`。
- 备注：`faster-whisper` 在当前 Windows 环境仍保留为未收口风险，但已不再阻塞本阶段的 Whisper 转录链路验收。

## 39. 当前后端虚拟环境仍为 CPU 版 PyTorch，导致 FunASR 固定落到 CPU
- 表现：FunASR 加载日志显示 `[FunASR] Using device: cpu`；本机同时存在可用 NVIDIA GPU（RTX 4070，`nvidia-smi` 正常），但 `backend/venv` 中 `torch.cuda.is_available()` 返回 `False`。
- 原因：当前后端运行时安装的是 `torch 2.5.1+cpu` 与 `torchaudio 2.5.1+cpu`，不是 CUDA 构建；因此即使设备选择逻辑优先 `cuda:0`，运行时也永远只能走 CPU。
- 处理：本轮后续需把 `backend/venv` 切换到 CUDA 版 `torch / torchaudio`，并重新验证 `torch.cuda.is_available()`、FunASR 加载日志和真实转录链路。

## 40. FunASR GPU 运行时已切换到 CUDA 版 PyTorch 并完成验证
- 处理：已将 `backend/venv` 中的 `torch / torchaudio` 从 `2.5.1+cpu` 切换到 `2.5.1+cu124`。
- 验证：`torch.cuda.is_available()` 已返回 `True`，设备识别为 `NVIDIA GeForce RTX 4070 Laptop GPU`；`FunASREngine().load(...)` 与独立后端 `/transcribe` 日志都显示 `[FunASR] Using device: cuda:0`。
- 结论：当前 “FunASR 固定落到 CPU” 问题已收口；后续如再次出现 CPU 回退，应优先检查 `backend/venv` 是否被重新装回 CPU 版 PyTorch。

## 41. 录音悬浮窗首次触发存在显示竞态
- 表现：快捷键或录音开始后，悬浮窗并非每次都在第一次稳定出现。
- 原因：当前 overlay 依赖 `show_overlay()` 后的一次性 `overlay-state` 推送，窗口初次加载时可能还未完成事件监听绑定。
- 处理：需补充 overlay ready 握手或可重放状态，消除首帧丢失。

## 42. 录音悬浮窗显示后，快捷键停止与点击交互未回到统一录音流
- 表现：悬浮窗出现后，再次按快捷键无法稳定停止；点击悬浮窗也无法稳定取消或停止。
- 原因：当前 overlay 与主窗口之间仍存在模糊事件命名和分散监听，未形成“主窗口录音流唯一入口”。
- 处理：需把 overlay 交互统一桥接回 `beginRecordingSession / finishRecordingSession / abortRecordingSession`。

## 43. 录音悬浮窗波纹不是可信的真实录音反馈
- 表现：当前悬浮窗中间的音量条/波纹不能保证直接反映真实录音电平，用户明确要求不能接受模拟动画。
- 原因：overlay 当前展示层没有把“真实 audio-level 是否稳定送达 overlay”作为硬约束。
- 处理：本轮要求以真实录音电平事件驱动波纹，非录音态不再播放假音频动画。

## 44. 录音悬浮窗视觉形态偏离目标
- 表现：当前悬浮窗体积偏大、卡片感过重、状态信息堆叠，和用户给出的胶囊型参考差距明显。
- 原因：当前实现仍沿用“信息卡片”思路，而不是“系统级轻量浮层”。
- 处理：本轮按专题重做视觉，改为更小的胶囊型浮层，录音中以左右操作按钮 + 中间真实波纹为主。

## 45. FunASR 与 HuggingFace 运行时缓存仍可能落到用户默认目录
- 表现：虽然项目配置与下载接口都以仓库根 `models/` 为目标，但实机检查发现 `C:\Users\DingK\.cache\modelscope` 与 `C:\Users\DingK\.cache\huggingface` 仍在本轮运行中被写入。
- 原因：后端只收口了 `MODEL_CACHE_DIR` 与部分显式下载接口；`FunASR AutoModel`、`modelscope`、`datasets`、`huggingface_hub` 的默认缓存环境变量没有在足够早的阶段统一覆盖，且说话人链路仍直接把模型 ID 交给第三方库自行解析。
- 处理：需要把运行时缓存根前置收口到项目内目录，并让 FunASR / 说话人链路优先使用仓库 `models/` 下的显式本地模型路径。
- 当前状态：已补齐运行时缓存环境变量并改为优先解析仓库 `models/` 下的本地模型路径；实测本轮加载期间 `C:\Users\DingK\.cache\modelscope` 与 `C:\Users\DingK\.cache\huggingface` 时间戳未继续变化，活动写入落在仓库 `models/`。仓库内仍存在 `models\models\...` 的冗余层级，这是 ModelScope 内部依赖模型的本地嵌套路径，不是回退到 C 盘默认缓存。
