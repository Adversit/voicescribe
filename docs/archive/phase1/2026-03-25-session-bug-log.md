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

## 46. 录音时间过短时，悬浮窗会卡在“正在转录”
- 表现：点击快捷键开始后立刻停止，UI 会进入“正在转录”并停住，未及时收口。
- 原因：前端 `finishRecordingSession()` 在停止后无条件先切到 `transcribing`，没有把“过短录音”作为可前置拦截的失败态处理。
- 处理：补充最短有效录音时长判断；过短时直接取消本次录音、关闭悬浮窗并提示，而不是继续进入转录链路。

## 47. 录音悬浮窗仍残留米色底板，且录音态操作图标不符合参考
- 表现：overlay 页面仍会出现整块米色背景；录音态右侧操作仍不是用户要求的完成对勾。
- 原因：overlay 页面复用了主界面的全局 `body` 背景色；录音态按钮图标仍沿用停止方块语义，没有按参考图收口。
- 处理：将 overlay 页面背景改为完全透明，录音态改为黑色胶囊、左侧叉号、右侧对勾，仅保留中间真实波纹。

## 48. 应用打开后偶发出现 `Failed to fetch`
- 表现：桌面端打开后，界面会直接提示 `Failed to fetch`，影响启动体验。
- 原因：前端在后端尚未完全 ready 时就开始请求 `/health`、`/models`、`/speakers` 等接口，浏览器层原始网络错误被直接透传到 UI。
- 处理：需要补充启动后的后端 ready 轮询，并把原始 `Failed to fetch` 统一映射成明确的中文提示；页面侧的模型/说话人/历史请求也应避免在 `backendConnected=false` 时抢跑。

## 49. `jieba.cache` 仍写入 `%LOCALAPPDATA%\Temp`，与“模型和缓存统一归仓库 models/”约束冲突
- 表现：FunASR 加载时日志显示 `Loading model from cache C:\Users\DingK\AppData\Local\Temp\jieba.cache`。
- 影响：即使主模型目录已收口到仓库 `models/`，运行时分词缓存仍会持续占用 C 盘空间，且不满足“所有模型相关缓存统一归仓库目录”的约束。
- 原因：当前只收口了 `modelscope` / `huggingface` / `transformers` / `torch` 相关环境变量，没有显式重定向 `jieba` 的缓存文件位置。
- 处理：在后端启动阶段显式把 `jieba` 缓存目录重定向到仓库 `models/jieba/`，并迁移历史 `%LOCALAPPDATA%\Temp\jieba.cache`；同时清点并迁移历史 `C:\Users\DingK\.cache\modelscope` 与 `C:\Users\DingK\.cache\huggingface` 后再清理 C 盘残留缓存。
- 当前状态：已完成历史 C 盘缓存迁移与清理；当前 `jieba` 已从仓库 `models/jieba/jieba.cache` 加载，`C:\Users\DingK\.cache\modelscope`、`C:\Users\DingK\.cache\huggingface` 与 `%LOCALAPPDATA%\Temp\jieba.cache` 均已不存在。

## 50. 冷启动后可能同时出现系统 Python 与 venv 两个 `server.py` 进程
- 表现：清空 8765 后重新走 `scripts/start_windows_system.bat --skip-build`，进程列表中会同时出现 `backend\venv\Scripts\python.exe ... server.py` 与 `D:\Anaconda3\python.exe ... server.py`；实际监听 8765 的是系统 Python 进程。
- 影响：如果只看任务管理器，容易误判为“桌面端重复启动了两套后端”；但这条现象本身不会导致 8765 被两个独立后端同时占用。
- 原因：已验证这不是桌面端额外拉起第二套后端，而是 Windows 上 `venv\Scripts\python.exe` 作为父进程，再由其拉起基础解释器 `D:\Anaconda3\python.exe server.py` 作为子进程提供实际监听。这是当前 `backend/venv` 基于 Anaconda Python 创建后的运行时表现。
- 验证：
  - 通过 `Get-CimInstance Win32_Process` 可见 `D:\Anaconda3\python.exe ... server.py` 的 `ParentProcessId` 指向 `backend\venv\Scripts\python.exe ... server.py`
  - 手动启动 `backend\venv\Scripts\python.exe server.py --port 8877` 时会复现同样的父子进程结构
  - 强制结束父进程后，子进程与 8877 监听端口会一并消失
- 处理：本条从“重复启动 bug”降级为“Windows venv 运行时表现说明”。当前不改启动代码；后续如需减少误解，可在 `/health` 或调试面板中补充 `sys.executable / sys.prefix / sys.base_prefix`。

## 51. 录音流、悬浮窗与托盘菜单仍残留中文乱码
- 表现：`recordingFlow.ts`、`RecordingOverlay.tsx` 与 `lib.rs` 中部分中文提示出现乱码，直接影响 toast、悬浮窗按钮/状态与托盘菜单可读性。
- 影响：即使录音和悬浮窗逻辑正常，用户仍会看到不可读文案，不满足当前“所有新写入中文必须保持正常 UTF-8”的约束。
- 原因：此前 Windows PowerShell 环境下多次改写文件后，局部字符串以错误编码写回，导致源文件中残留 mojibake。
- 处理：本轮统一按 UTF-8 正常中文重写这些用户可见字符串，并补构建验证，避免再次把乱码带进桌面端运行时。

## 52. `feature-rt-history-hotkey` 专题需求与 spec 正文被写成乱码
- 表现：`2026-03-28-rt-history-hotkey-requirements.md` 与 `2026-03-28-rt-history-hotkey-spec.md` 的正文大面积变成乱码，但顶部 2026-03-29 新增补充段仍是正常中文，形成“新段落正常、旧正文损坏”的混合状态。
- 影响：当前专题文档无法继续作为后续实现与验收依据，违背 `plan > spec > checklist > code` 的工作顺序。
- 原因：后续某轮在 Windows PowerShell 下局部改写这两份文档时，只把新增段落按 UTF-8 写回，正文基线却以错误编码保留，导致 HEAD 中出现混合编码内容。
- 处理：已从 `48c4d37` 中恢复这两份文档的正常中文正文，再将 2026-03-29 的快捷键交互补充和状态机调整重新按 UTF-8 写回。

## 53. overlay 窗口事件监听被 Tauri ACL 拒绝，导致首次录音后悬浮窗不显示真实状态
- 表现：冷启动后按快捷键开始录音，热键日志显示 `hotkey-start-recording -> beginRecordingSession -> startRecording success` 已命中，但 overlay 没有稳定显示录音胶囊；日志里明确出现 `overlay bind failed: Command plugin:event|listen not allowed by ACL`。
- 影响：这会把问题伪装成“快捷键第一次没反应”或“开始后只弹出米黄色空框”，并进一步让用户误判为“停止后没有进入转录/模型懒加载”。
- 原因：当前 Tauri capability 只授权了 `main` 窗口；overlay 页面虽然创建成功，但它自己的 `listen("overlay-state")` / `listen("audio-level")` 在 ACL 层被拒绝，导致首次状态无法消费。
- 处理：本轮日志验证已确认真实断点，下一步需把 overlay 窗口纳入 capability 或补专用 capability，并回归验证 `overlay-ready / overlay-state / audio-level` 三条事件链。
## 54. overlay 事件 ACL 缺失已修复，冷启动后监听已恢复
- 处理：将 `tauri-app/src-tauri/capabilities/main.json` 的 capability 作用窗口从仅 `main` 扩展到 `main + overlay`，使 overlay 页面具备 `core:event:default` 所含的 `listen / unlisten / emit / emit-to` 权限。
- 验证：重建并重启系统后，`C:\Users\DingK\AppData\Local\Temp\voicescribe-hotkey.log` 中原先的 `frontend overlay bind failed: Command plugin:event|listen not allowed by ACL` 已消失，替换为 `frontend overlay bind success` 与 `frontend overlay-ready emitted to main`。
- 当前结论：悬浮窗首次不显示的第一层硬阻塞已经解除；后续若仍有“只见空框”或“停止后不转录”，应继续沿 `overlay-state / audio-level / finishRecordingSession / /transcribe` 链路排查，而不再回到 ACL 权限层。
## 55. overlay 根层透明不彻底，录音时仍露出米黄色背景板
- 表现：虽然黑色胶囊已经出现，但胶囊外仍有一整块米黄色矩形底板，破坏悬浮窗观感。
- 原因：当前只对 `body.overlay-window` 与 `#overlay-root` 做了透明处理，`html` 根层仍沿用主应用全局背景色，导致透明窗口中透出浅色底板。
- 处理：需把 overlay 页面根层透明约束扩展到 `html + body + #overlay-root`，必要时在 `overlay.html` 上单独标记 `html.overlay-window` 以避免复用主界面底色。

## 56. overlay 波纹当前更像电平灯，不像真实录音波纹
- 表现：用户观察到波纹呈现“不是 0 就是 1”的跳变感，缺乏中间高、边缘低的录音波纹观感。
- 原因：当前前端主要吃 `audio-level` 标量并以历史队列直接画柱条，本质上更接近电平条；虽然信号来自真实录音，但可视化维度不够，无法呈现真实波形/包络。
- 处理：改为让 overlay 直接消费录音线程发出的真实 `audio-chunk` PCM 数据块，基于真实样本窗口计算柱条，再做轻度平滑与镜像排布，确保“真实驱动”与“可读观感”同时满足。
## 57. 快捷键开始录音后缺少稳定首帧反馈，用户重复按键会立刻触发停止与转录
- 表现：用户主观感受为“开始录音时要等说话人分离/识别模型加载，按很多次快捷键才会启动”。
- 实际日志：`voicescribe-hotkey.log` 显示第一次 `hotkey-start-recording` 已经成功进入 `beginRecordingSession -> startRecording success`；后续重复按键马上触发 `hotkey-stop-recording -> finishRecordingSession -> transcribeAudio`，此时才进入 `backend transcribe request ... diarization=true`。
- 根因：当前 `overlay-ready` 监听是在第一次 `showOverlay()` 时才注册，导致 overlay 启动早于主窗口监听注册时会丢失首个 ready 事件；于是 `waitForOverlayReady` 在开始录音后反复超时，用户第一时间看不到稳定的启动反馈，容易连续再按，把录音立刻停掉。
- 结论：所谓“开始录音被说话人模型加载拖慢”是表象，真实问题是录音已开始但首帧可见反馈不足，重复点击把流程切换到了停止/转录分支。
- 处理：需要把 overlay-ready 监听前移到主窗口启动阶段，避免首个 ready 事件丢失，并回归验证首次开始录音是否不再出现 `waitForOverlayReady timed out`。
## 58. `Right Alt` 单键热键会在一次物理按压中重复触发两次开始录音
- 表现：用户感觉“第一次按快捷键经常启动不了，需要多按几次”；最新热键日志显示同一秒内会连续出现两条 `hotkey-start-recording`。
- 实际日志：在同一次 `Right Alt` 按压下，先后出现 `single_click -> start`、`beginRecordingSession startRecording success`，随后紧接着又出现第二条 `single_click -> start`，并导致 `beginRecordingSession startRecording failed: Recording already active`。
- 影响：这会伪装成“快捷键第一次不生效”或“开始阶段被别的任务阻塞”，实际上是热键层对同一物理按压重复发出了开始事件。
- 处理：需在 Rust 热键层对同名开始/停止事件增加短时去重，优先挡住 `Right Alt` 这种单键触发的重复上报。
## 59. `Right Alt` 单键热键重复触发已在 Rust 热键层增加 200ms 去重
- 处理：在 `tauri-app/src-tauri/src/commands/hotkey.rs` 为同名 `hotkey-start-recording` / `hotkey-stop-recording` 增加短时去重窗口；同一物理按压内若重复上报相同事件，则直接记录 `suppress_duplicate_event` 并丢弃。
- 验证：`cargo check` 已通过；随后手动结束旧的 `voicescribe-desktop.exe` 与 `server.py`，再完整执行 `cmd /c scripts\start_windows_system.bat`，新进程启动时间更新为 2026-03-29 23:19:21（桌面端）和 2026-03-29 23:19:23（后端）。
- 当前结论：此前“更新后像是没重启”的判断在本次链路里部分成立，`start_windows_system.bat` 单独执行时没有替换已在运行的旧桌面进程；本轮已通过手动清理旧进程后重启到最新代码。热键去重的真实手测结果仍待用户再次按一次 `Right Alt` 回归确认。
## 60. 外接键盘 `Right Alt` 在设置页被保存为 `AltRight(165)`，但运行时低层 hook 实际收到 `vk=164`
- 表现：重启后用户明确使用外接键盘右 Alt 单击，应用界面与后端均无反应；热键日志只出现 `raw_modifier_event vk=164 ...`，没有 `matches_hotkey`。
- 对照：当前持久化设置文件 `C:\Users\DingK\AppData\Roaming\com.voicescribe.desktop\voicescribe-settings.json` 中保存的是 `display=Right Alt`、`primaryCode=AltRight`、`primaryKeyCode=165`。
- 结论：当前不再是“没重启”或“第一次要多按几次”的问题，而是“设置页录制到的浏览器键位标识”和 Windows 低层 hook 收到的实际键码在外接键盘上不一致”。
- 下一步：优先修 `hotkey.rs` 的左右 Alt 判定逻辑，不只按裸 `vkCode`，还要结合低层键盘事件的扩展标志识别物理右 Alt。
## 61. 外接键盘右 Alt 匹配已改为结合低层扩展标志识别
- 处理：`tauri-app/src-tauri/src/commands/hotkey.rs` 不再只按 `vkCode == 165` 认右 Alt，而是改成“右 Alt = `vk=165` 或 `vk=164 + extended flag`”；同时原始热键日志补充 `scanCode` 与 `flags`，便于区分物理左右 Alt。
- 验证：`cargo check` 通过；手动清理旧的桌面端与 `server.py` 后重新执行 `cmd /c scripts\start_windows_system.bat`，新进程时间更新为桌面端 2026-03-29 23:29:50、后端 2026-03-29 23:29:52，`/health=healthy`。
- 待人工验收：用户使用外接键盘右 Alt 单击一次，确认是否出现 `matches_hotkey`、悬浮窗与录音启动。## 62. 右 Alt 扩展标志匹配修复未真正落盘，当前运行时仍按裸 k == 165 判断
- 现象：最新日志中已经能看到外接键盘右 Alt 出现 k=164 scan=56 flags=32 这类扩展键事件，但仍然没有 matches_hotkey。
- 排查：回读 	auri-app/src-tauri/src/commands/hotkey.rs 发现 matches_hotkey 仍然是旧实现 k == primary_key_code，说明上一轮“按扩展标志识别右 Alt”的替换没有真正写进源码。
- 结论：这条当前不是用户按错，也不是模型加载慢，而是修复未落盘，运行时代码仍无法识别 k=164 + extended flag 这一类外接键盘右 Alt 事件。

## 63. 空录音/无效语音进入说话人分离时会抛 500，并触发前端重复重试
- 现象：ackend/diarization/speaker.py 在 self.diarization_model(processed_audio_path) 处抛出 AssertionError: modelscope error: The effective audio duration is too short.，随后 /transcribe 返回 500，前端热键日志持续出现多次 ackend transcribe attempt -> response_error 500。
- 结论：当前空录音或没有有效语音内容时，后端没有把“说话人分离最短有效音频长度不足”收口成可预期分支，而是直接炸成 500；前端又把它当成可重试错误，造成重复循环。
- 下一步：在 speaker.py 和 server.py 把“空音频/过短音频/无语音内容”降级成跳过 diarization 或用户可理解的失败，不再返回 500。
## 64. 快捷键首次成功后，后续同一物理键经常失配，表现为“要连按很多次才再次生效”
- 现象：应用冷启动后，第一次使用当前录制保存的热键可以正常开始/停止录音；但完成一次录音后，后续再次按同一物理键时，往往需要连续按很多次才会再次命中热键。
- 日志：`voicescribe-hotkey.log` 已确认第一次成功链路会出现 `matches_hotkey -> beginRecordingSession startRecording success -> hotkey-stop-recording -> /transcribe 200`；后续失效按键则大量表现为 `raw_modifier_event vk=164 scan=56 flags=32/128`，只有 `hotkey_candidate`，没有 `matches_hotkey`。
- 结论：当前不是“默认热键回退”或“录音状态未复位”，而是“设置页保存的 `primaryCode=AltRight / primaryKeyCode=165`”与运行时低层 hook 收到的物理键事件并不稳定一致；现有 `hotkey.rs` 仍按裸 `vk == primary_key_code` 判断，无法稳定覆盖该物理键的后续事件形态。
- 处理：下一步在 `tauri-app/src-tauri/src/commands/hotkey.rs` 把热键匹配从“仅看 vk”收口为“按保存的 primaryCode + scanCode/extended flag 识别物理键”，并保留当前日志，避免再靠猜测修改。

## 65. 空录音 / 无有效语音进入说话人分离时仍会炸成 500，且前端会重复重试
- 现象：用户打开录音后未说话或有效语音极短时，后端 `backend/diarization/speaker.py` 在 `self.diarization_model(processed_audio_path)` 处抛出 `AssertionError: modelscope error: The effective audio duration is too short.`，随后 `/transcribe` 返回 `500 Internal Server Error`；前端 Rust `transcribe` 命令把这类 500 当作可重试错误，日志里会连续出现多次 `backend transcribe attempt -> response_error 500`。
- 结论：当前系统还没有把“空录音 / 过短录音 / 无有效语音”作为正常业务分支处理，而是直接落入 diarization 模型异常，既影响结果，也制造了无意义的重复请求。
- 处理：下一步在 `backend/diarization/speaker.py` 增加音频时长与有效能量预检查，并在 `backend/server.py` 中把“无文本 / 过短音频 / diarization 最小时长不满足”降级为跳过说话人分离或返回可理解结果，不再返回 500。

## 66. 空录音 / 无有效语音进入说话人分离的 500 已降级为正常返回
- 处理：`backend/diarization/speaker.py` 现在会在进入 diarization 前先检查音频时长与 RMS；对静音、过短音频，以及 ModelScope 明确抛出的 `effective audio duration is too short`，统一跳过说话人分离并返回空分段，而不是继续抛异常。
- 同时：`backend/server.py` 在 `enable_diarization=true` 时，如果转录结果为空文本/空 segments，会直接跳过 diarization；外部分离返回空 speaker segments 时，也不再抛 500。
- 验证：已重启系统，并用 `.tmp-tests/silence-6s.wav` 执行 `POST /transcribe(engine=funasr, model=seaco-paraformer, enable_diarization=true)`；当前返回 `200`，结果为 `{\"text\":\"\",\"segments\":[],\"duration\":0.0,...}`，不再出现 500 循环。

## 67. 热键运行时命中逻辑已开始从“旧 vk 精确匹配”迁移到“按保存的 primaryCode 识别物理键”
- 处理：`tauri-app/src-tauri/src/commands/hotkey.rs` 已移除仅按 `primary_key_code` 的核心命中路径，改为按保存的 `primary_code` 识别物理键；并把主键属于 Alt 家族时的修饰键归一化从“只忽略当前侧”收口为“忽略整组 Alt 状态”，避免主键本身被再次算进 modifiers mismatch。
- 当前状态：这条已完成代码替换和 `cargo check` 编译验证，但尚未完成外接键盘 `Right Alt` 的人工回归，所以暂不宣称完全验收通过。

## 68. 左右 Alt 的人工验证曾混用，导致部分“热键后续失效”现象存在验证样本污染
- 新信息：用户补充确认，之前某些人工验证场景里，录制保存时与实际回归按下时，左右 Alt 可能并不是同一侧；也就是说，之前出现的部分“第一次可用、后续又失效”现象，有可能包含“录制的是右 Alt，验证时按到了左 Alt”这一人为混淆因素。
- 当前结论：此前关于外接键盘 Alt 命中不稳定的日志分析仍然成立，但其人工现象样本需要重新按“录制哪一侧，就只验证哪一侧”的口径再做一轮回归，避免把左右 Alt 混用误判成运行时失效。
- 后续处理：保留当前 `primaryCode` 命中逻辑修正；下一轮热键人工验收必须显式记录为 `Left Alt` 或 `Right Alt`，不再使用泛化的“Alt”表述。

## 69. 旧快捷键兼容层仍残留，需在稳定 `hotkeyBinding` 路径后删除
- 现状：前端真正使用的已经是 `hotkeyBinding` 结构，但仓库内仍保留旧的 `registerHotkey(modifiers, keyCode)` / `register_hotkey(...)` 接口，以及设置结构中的 `hotkeyModifiers`、`hotkeyKeyCode` 兼容字段。
- 风险：这些旧字段和旧接口虽然当前基本不再承担主路径职责，但会继续制造“到底哪套才是正式口径”的歧义，也增加后续热键问题定位成本。
- 处理：下一步删除旧快捷键兼容层，只保留 `hotkeyBinding` 作为唯一持久化与注册入口；删除后再按 `Left Alt` / `Right Alt` 明确区分做人工回归。

## 70. 旧快捷键兼容层已删除，当前仅保留 `hotkeyBinding` 作为唯一入口
- 处理：已删除前端旧 API `registerHotkey(modifiers, keyCode)`、Rust 旧命令 `register_hotkey(...)`、旧转换函数 `build_binding_from_legacy(...)` 与旧设置字段 `hotkeyModifiers`、`hotkeyKeyCode`；同时移除了 `HotkeyState` 中不再使用的 `modifiers/key_code` 状态位。
- 验证：全局检索已确认仓库内不再存在这些旧接口/旧字段的调用残留；`cargo check` 与 `npm run build` 已通过。
- 当前口径：快捷键录制、持久化、启动重注册与运行时命中，后续只允许走 `hotkeyBinding` 这一套新结构，不再存在“旧接口兜底”的解释空间。

## 71. 快捷键录制仍走浏览器 `KeyboardEvent`，与运行时 Windows 低层 hook 不是同一事件源
- 现状：虽然运行时命中已经在 `tauri-app/src-tauri/src/commands/hotkey.rs` 内走 Windows 低层 hook，但快捷键设置页 `tauri-app/src/pages/HotkeySettings.tsx` 仍使用浏览器 `keydown/keyup` 的 `event.code` 录制 binding。
- 风险：录制源与命中源不是同一事件层时，左右 Alt、左右 Ctrl、AltGr 这类键位的表达方式可能并不完全同构，容易出现“录制时是一套、运行时匹配时是另一套”的偏差。
- 处理：下一步把快捷键录制也切到 Windows 底层 hook，由 Rust 直接产出 `HotkeyBinding` 并回传前端；浏览器层不再自己构造 binding。

## 72. ????????? Windows ?? hook????????????
- ???????????? Rust `hotkey.rs` ????? hook???????????? `KeyboardEvent` ?? binding?
- ??????? Rust ?????? / ????????? hook ???? `HotkeyBinding` ??????????????? Rust ??? binding??????? `primaryCode / primaryKeyCode / modifiers`?
- ???????????????????`Left Alt / Right Alt / Left Ctrl / Right Ctrl / AltGr` ???????????????????? Windows hook ??????

## 73. ????????? Windows ?? hook??? Alt ???????
- ???Rust `hotkey.rs` ?????????????? hook ???? `HotkeyBinding` ??? `hotkey-capture-complete` ??????????????? `keydown/keyup` ????????????????????? binding?
- ????`cargo check`?`npm run build`?`cmd /c scripts\start_windows_system.bat` ? `/health` ????????????????????????????????????
- ????????????? `Left Alt` / `Right Alt` ???????????????????????????????????????????
## 74. 快捷键录制与运行时命中仍不是同一套归一化链路，且录制中可误用旧 binding
- 现象：`start_hotkey_capture` 已进入 Rust，但当前日志里只有 `start_hotkey_capture` 与前端的 `capture start registered`，没有出现任何 `capture_key_down` / `capture_key_up` / `capture_complete`；随后前端仍可能直接执行 `capture apply ...`，把旧的 `hotkeyBinding` 再注册一遍。
- 影响：用户主观体验会变成“点了录制快捷键，但没有完成录制”；即使实际没有拿到新的捕获结果，界面仍允许继续点“应用快捷键”，把问题伪装成“录制成功但保存后没生效”。
- 原因：当前运行时命中逻辑已经开始按 `primaryCode + modifiers` 识别物理键，但录制链路内部的按键归一化仍是另一套实现；尤其 `Alt` 家族在捕获路径与运行时路径的判定没有完全共用同一个底层函数。同时，`HotkeySettings.tsx` 在录制态没有强制要求“必须先收到最新 capture 结果才能应用”，导致旧值可被误提交。
- 处理：下一步把 Rust 侧“物理键事件 -> 归一化 code -> HotkeyBinding”的逻辑收口为单一实现，录制和运行时共用；前端录制态清掉旧 draft，未收到新的 `hotkey-capture-complete` 前禁止应用，并补充更细日志确认问题断点是在“未捕获”还是“已捕获但未回到前端”。

## 75. encoding_guard ??? UTF-8 ?????????? UTF-8 ???????????
- ???`docs/archive/phase1/2026-03-25-session-bug-log.md` ?????? `???`?`?` ??????????? `encoding_guard.py verify` ??? `OK`?
- ????????? UTF-8 ?????????????? `\ufffd` ???? `\x00`???????????? UTF-8????????????? `?` ???????
- ????????????????????? UTF-8/GBK ?????????????????????????????
## 75. 快捷键设置页中文文案被写成 JSX 文本节点中的 `\uXXXX` 字面量
- 表现：快捷键设置页部分中文没有正常显示为中文，而是直接显示转义串或乱码感文案。
- 原因：本轮为了规避 PowerShell 中文写入风险，界面文案改写时把 `\uXXXX` 直接写进了 JSX 文本节点；在 JSX 文本节点里这不会被当作 JavaScript 字符串转义执行，只会按普通文本原样渲染。
- 影响：用户无法正常阅读快捷键页提示，且容易误判“录制没有进入等待状态”。
- 处理：需要把所有中文文案收口到常量字符串或表达式里渲染，不能继续把 `\uXXXX` 直接放在 JSX 文本节点中。

## 76. 快捷键录制启动后未进入稳定捕获态，日志只有 `start_hotkey_capture/stop_hotkey_capture`
- 表现：点击“开始录制”后，用户按键没有得到新的录制结果；热键日志里只看到 `frontend capture start requested -> start_hotkey_capture -> frontend capture start registered -> stop_hotkey_capture`，没有 `capture_key_down` / `capture_complete`。
- 当前观察：同一时间段之后的普通输入日志只剩 `hotkey_state ...`，说明录制按键时 `capture_active` 已经不是有效状态。
- 影响：当前不能宣称“快捷键录制已修复”，因为真实录制主链路还没有闭环。
- 处理：需要继续定位前端为什么过早退出录制态，并补足日志，确认是按钮焦点、副作用 cleanup，还是录制态切换本身导致的提前停止。

## 77. 最小探针模式证明录制窗口内没有任何键盘事件进入当前 hook 回调链路
- 时间: 2026-03-30
- 表现：
  - 新探针版进程日志已出现 `frontend capture start requested` 与 `start_hotkey_capture active=true generation=1`。
  - 但从开始录制到停止录制的 7 秒窗口内，没有任何 `capture_probe ...`、`capture_raw_event ...`、`capture_key_down ...` 或 `capture_complete ...`。
  - 停止录制后数秒内，普通键盘事件日志重新出现，仍然只有 `capture_skip_inactive ...` 与 `hotkey_state ...`。
- 已确认事实：
  - 前端按钮链路正常，Rust `start_hotkey_capture()` 已执行。
  - hook 线程正常存活。
  - 探针模式设计为在开始录制后的 10 秒内记录所有进入 hook 的键盘事件；实际录制窗口内一条都没有。
- 结论：
  - 根因已经收敛到“录制窗口内键盘事件没有进入当前 hook 回调链路”，而不是 binding 组装、保存设置、重新注册，或 `CaptureState.active` 可见性错误。
- 当前状态：
  - 未解决。
  - 后续不应继续直接修改 capture 完成状态机，应优先排查录制窗口内输入事件为何没有进入 hook。

## 78. hook 生命周期自检日志在启动路径持锁回调自身状态查询，可能把 hook 线程启动卡死
- 时间: 2026-03-30
- 表现：
  - `ensure_hook_thread()` 在持有 `HOOK_THREAD` mutex 的同时等待 `startup_rx.recv_timeout(...)`。
  - 同期新增的 `log_hook_runtime_status(...)` 会再次读取 `HOOK_THREAD` 状态。
  - 如果在 hook 线程启动路径或 `startup confirmed` 路径调用该自检函数，进程会停在 `ensure_hook_thread: starting` 附近，不再继续输出后续启动日志。
- 已确认事实：
  - `hook_thread:started` 位于新线程启动早期，会在主线程仍持有 `HOOK_THREAD` mutex 时尝试再次读取该 mutex。
  - `ensure_hook_thread:startup_confirmed` 位于 `*thread_guard = Some(handle)` 之后、`thread_guard` 释放之前，也会在同一线程内自锁。
- 结论：
  - 这不是热键录制根因的最终确认，但它会污染 hook 生命周期检测结果，必须先移除这两个启动路径自检调用，再继续做线程存活性判断。
- 处理：
  - 先删除 `hook_thread:started` 与 `ensure_hook_thread:startup_confirmed` 两处 `log_hook_runtime_status(...)` 调用。
  - 删除后重新执行 `cargo check`、`npm run build`、桌面进程重启与热键日志检查，再继续判断 hook 是否进入 stale slot / dead thread 状态。

## 79. hook 线程已确认存活时，录制窗口内仍没有任何键盘事件进入 `keyboard_hook_proc`
- 时间: 2026-03-30
- 表现：
  - 新进程启动后，日志已出现完整 hook 启动链路：`ensure_hook_thread: SetWindowsHookExW succeeded` 与 `ensure_hook_thread: startup confirmed`。
  - 用户点击“开始录制”后，日志显示 `slot_present=true thread_id_present=true thread_finished=false capture_active=true`。
  - 但从 `frontend capture start registered` 到 `frontend capture stop requested by button` 之间，仍然没有任何 `capture_probe ...`、`capture_raw_event ...`、`capture_key_down ...` 或 `capture_complete ...`。
  - 停止录制后，下一次普通按键又立即出现 `capture_skip_inactive ...` 与 `hotkey_state ...`。
- 已确认事实：
  - 这次不是 hook 线程假存活，也不是启动路径死锁。
  - `start_hotkey_capture()` 已成功把 `CaptureState.active` 设为 `true`，且 `ensure_hook_thread()` 返回的是现有存活线程。
  - 录制窗口内没有任何键盘事件进入 `keyboard_hook_proc(...)`，而停止录制后事件又恢复进入同一条回调链路。
- 结论：
  - 当前根因进一步收敛到“录制窗口内输入事件被系统层或窗口交互层绕开了当前低层 hook 回调链路”，而不是 hook 生命周期、capture 状态可见性、binding 组装或保存/重注册问题。
- 处理：
  - 后续应优先排查录制窗口打开后的输入焦点、系统组合键、副窗口/消息循环干扰，或考虑把录制输入探针前移到更外层的 Windows 输入链路。
  - 在继续改判定逻辑前，先把诊断日志扩展到 `HotkeySettings.tsx` 的开始/停止按钮、Tauri invoke 边界、`hotkey-capture-complete` 回传、apply/store/re-register 链路，确保人工测试时能按同一条时间线判断问题停在哪一段。

## 80. ???????? Rust capture ????? keydown/keyup
- ??: 2026-03-30
- ??: ?? Tauri/Rust ??????????????????????????? `keyboard_hook_proc(...)`????????? hook ??????????????
- ??: ???? `D:\learn\AIGC\voicescribe\voicescribe` ????????????? hook?????????? `keydown/keyup`?????????? Windows ?? hook ?????? Alt ???????? `AltLeft / AltRight`????? `VK_LMENU / VK_RMENU` ? `VK_MENU + extended flag` ???
- ??: ??????????????? `keydown/keyup`?????????? `HotkeyBinding { keys, display }` ?????? Rust ?? hook??? Alt ??????/??/Esc ????????

## 81. Runtime hotkey can be blocked by a stale key in `pressed_keys`
- Time: 2026-03-30
- Symptom: the hotkey is registered, but pressing the configured single key does nothing.
- Evidence: hotkey logs showed `binding=0xA5` while `pressed=0x9+0xA5`, meaning a stale `Tab` remained in `pressed_keys` before Right Alt was pressed.
- Root cause: the runtime matcher depends on exact set equality, but system-level flows such as Alt+Tab can miss a later key-up event and leave a ghost key in the pressed set.
- Fix direction: before each runtime comparison, prune tracked keys that are no longer physically down according to the current keyboard state, then continue normal matching.

## 82. Runtime hotkey was swallowing matched keys instead of observing like the reference implementation
- Time: 2026-03-30
- Symptom: after the hotkey implementation landed, matching keys could be blocked from foreground apps because the hook returned an intercepted result on match.
- Reference comparison: the reference repo hook logs key events and always `CallNextHookEx(...)`; it does not swallow matched hotkeys.
- Root cause: the migrated Rust runtime kept the old `return LRESULT(1)` behavior for hotkey press/release and `Esc` cancel paths.
- Fix direction: keep runtime state-machine behavior, but make the low-level hook observe-only so matched keys continue to the foreground app.

## 83. Settings-page capture can still trigger the old registered hotkey if runtime matching is not suspended
- Time: 2026-03-30
- Symptom: during settings capture, pressing the same keys as the currently registered hotkey can start recording unexpectedly.
- Root cause: browser-based settings capture and Rust runtime hotkey matching are separate paths, and runtime matching remains active unless explicitly suspended.
- Fix direction: suspend runtime hotkey matching before settings capture starts, resume it when capture ends, and keep the saved binding intact.

## 84. The reported 7-8 second recovery after clicking Apply is not explained by any explicit wait in current code
- Time: 2026-03-30
- Symptom: after clicking Apply in hotkey settings, runtime hotkey matching appears to recover only after about 7-8 seconds.
- Current code reading:
  - `HotkeySettings.tsx` Apply only updates store and shows success toast.
  - `useHotkey.ts` re-registers on a separate async effect.
  - `resume_hotkey_runtime()` is triggered from capture cleanup, not from the Apply chain itself.
  - Existing explicit waits in hotkey code are only around 200ms, 350ms, or a 2s hook startup timeout.
- Current conclusion:
  - "Apply does not form a single synchronous close-out chain" is a real design problem.
  - But that design problem alone does not explain a stable 7-8 second window.
- Next diagnostic requirement:
  - add one shared `trace_id` across `capture/apply -> register -> resume -> first post-apply hotkey_state`
  - then determine whether the delay occurs before register, between register and resume, or after resume while runtime matching is still effectively blocked
  - preserve the actual order seen in logs, rather than assuming Apply happens before resume
