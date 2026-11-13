# 验证-脚本跑旧产物与Electron入口

## 触发条件
跑 `node scripts/xxx.mjs` 类实机验证脚本时「修复没生效」；或 `npx electron .` 报 `app.requestSingleInstanceLock is not a function`。

## 首选姿势
- 验证脚本跑的是 `dist/`：改了 `src/` 必须先 `npm run build`。判据：日志里 chunk 文件名（哈希）没变 = 跑的旧产物。`npm run test:rich-editor` 已自带 build，手动跑脚本则自己先 build。
- 启动 Electron 用项目入口 `node electron/launch.cjs`（它 delete process.env.ELECTRON_RUN_AS_NODE）；环境注入的 ELECTRON_RUN_AS_NODE 会让 `npx electron .` 以纯 Node 跑。
- 实机断言"鼠标移入/悬停"类行为用 `page.mouse.move(x,y)`，不能 dispatchEvent 合成 MouseEvent——elementFromPoint 走真实指针命中，合成事件永远定位不到元素。判据：合成失败但 page.mouse 成功 ⇒ 测试方式问题，不是功能缺陷。

## 反面清单
- 改完 src 直接跑脚本然后断言"修复无效"（本项目已踩过两次）。
- 用合成 mousemove 测块手柄/浮层定位。

## 验证方式
脚本输出全绿且 exit 0；失败时先看 chunk 哈希是否更新。