/** New API Provider: native, theme-aware settings with one active gateway. */
window.__ModuleLoader__.load({
  id: 'dsh-newapi-provider',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef, useId } = React;
    const NS = 'newapi-provider-ui';
    const ZH = {
      nav: 'New API 提供商', title: 'New API Provider', subtitle: '管理你的模型网关、额度与生成能力。',
      refresh: '同步数据', refreshing: '同步中…', add: '添加渠道', channels: '渠道与连接', models: '模型能力', media: '生成记录',
      channelHint: '同一时间只激活一个渠道，模型、额度和生成工具随之切换；已提交的视频任务仍由原渠道处理。', activateShort: '激活', activeTip: '当前激活的渠道', inactiveTip: '未激活的渠道', healthOk: '连接正常，额度已同步',
      healthNoKey: '尚未设置令牌', healthBad: '连接异常', healthStale: '额度数据已过期', healthUnknown: '尚未检测',
      activateTip: '切换到这个渠道', channelTestTip: '测试连接（只读取模型目录，不产生费用）', editChannelTip: '编辑渠道设置', removeChannelTip: '删除这个渠道',
      modelTestChatTip: '测试此模型（发送一次极短请求，会产生少量费用）', modelTestPaidTip: '测试此模型（会实际生成，需二次确认）',
      modelsOfChannel: '渠道', viewingInactive: '正在查看未激活渠道的模型清单。编辑会保存到该渠道，但对话中使用的仍是当前激活渠道。',
      channelModelsHint: '每个渠道独立维护自己的模型清单和参数。', loadingModels: '正在读取该渠道的模型…', modelsLoadFailed: '读取模型失败',
      active: '使用中', inactive: '未激活', activate: '激活此渠道', edit: '编辑', remove: '删除', cancel: '取消', confirmRemove: '确认删除',
      deleteHint: '只移除渠道配置；不会删除凭据或上游账号。', lastChannel: '至少保留一个渠道',
      activateHint: '切换会影响所有使用此插件的会话；已经提交的视频任务仍由原渠道处理。',
      currentChannel: '当前激活渠道', tokenUsed: '令牌累计已用', tokenRemaining: '令牌剩余额度', accountBalance: '账户剩余额度',
      unlimited: '令牌额度不限', totalModels: '可发现模型', chat: '对话', image: '生图', video: '视频', audio: '音频', embedding: '向量', other: '其他',
      all: '全部', text: '文本', pdf: 'PDF', inputImage: '图片', inputVideo: '视频', inputAudio: '音频',
      credentialSet: '凭据已设置', credentialMissing: '未设置凭据', failed: '连接异常', loading: '正在加载…', retry: '重试',
      sidebarBalanceHint: '点击刷新额度',
      loadFailed: '无法读取渠道数据', loadFailedHint: '如果刚重启过 DSH，请确认插件已加载后再试。',
      cached: '已缓存', balanceUnavailable: '额度暂不可用', notFetched: '待查询', used: '已用', remaining: '剩余',
      accountHint: '想看账户总余额？请在 New API 令牌设置中打开「允许查询用户额度」。',
      activeName: '渠道', route: '模型路由', unknown: '未知', save: '保存', saving: '保存中…',
      newChannel: '添加 New API 渠道', editChannel: '编辑渠道', channelName: '渠道名称', channelNamePlaceholder: '例如：主力站点、备用网关',
      address: '网关地址', addressHint: '支持填写站点根地址，或以 /v1 结尾的地址。',
      apiKey: 'API 令牌', keyPlaceholder: 'sk-…', keyUnchanged: '留空则继续使用已有凭据',
      keyHint: '只写入 DSH 凭据库，不回显、不存进渠道配置。', activateOnSave: '保存后激活此渠道',
      connectionSection: '连接信息', credentialSection: '访问凭据', keyRequiredForAddress: '网关地址已修改：为安全起见，需要重新填写此网关的令牌。',
      keyWillReplace: '保存后将替换为新令牌', showKey: '显示', hideKey: '隐藏',
      testConnection: '测试连接', testing: '测试中…', testPassed: '连接成功', testHint: '仅查询模型目录，不产生模型调用费用。',
      editHint: '每个渠道独立保存地址、凭据及模型覆盖参数。', newHint: '用已有 New API 站点的地址和调用令牌连接。',
      conflict: '配置已被其他窗口修改。请关闭编辑框并刷新后重试。', saved: '已保存渠道', activated: '已切换激活渠道', removed: '已移除渠道',
      filter: '按名称或供应商搜索', modelsHint: '以下目录属于当前激活渠道。能力信息来自 models.dev，并不保证中转站实际支持；可按模型校正。',
      namingSection: '名称与映射', capacitySection: '容量与能力', advancedOptions: '高级选项',
      localModelId: '本地模型 ID', upstreamModel: '上游映射模型名', upstreamHint: '实际发送给网关的 model。留空使用本地模型 ID，不会重命名现有会话。',
      displayNameHint: '只改变 DSH 中的显示，不影响实际请求。', mappingPreview: '实际请求', mapped: '已映射', noMapping: '未映射 · 使用原 ID',
      invalidMapping: '模型名最长 500 个字符，不能包含空白或控制字符。',
      automaticMode: '自动', customMode: '自定义', followAuto: '跟随模型目录', enableReasoning: '支持', disableReasoning: '不支持',
      protocolLabel: '请求协议', mappingMetadataHint: '映射变更后，自动能力会在保存时按目标模型重新识别；手动参数仍优先。',
      resetAsk: '确认恢复默认', resetDescription: '将清除显示名、上游映射、容量与能力等全部自定义参数。', unsaved: '有未保存修改',
      model: '模型', capabilities: '能力与上下文', source: '能力来源', parameters: '参数', context: '上下文窗口', maxOutput: '最大输出',
      reasoning: '推理', noReasoning: '未声明推理', auto: '自动识别', overridden: '已自定义', defaults: '默认值',
      modelEmpty: '没有匹配的模型', noModels: '当前渠道暂无模型目录', hidden: '已隐藏', modelEdit: '编辑模型参数', modelEditHint: '只影响此渠道的该模型；不会修改 New API 站点。',
      kind: '模型类型', displayName: '显示名称', inputModalities: '输入能力', inputHint: 'DSH 对话层支持文本与图片；PDF、音视频标签仅用于展示，不能直接作为对话输入。',
      reasoningEnabled: '声明支持推理', hideModel: '隐藏该模型', modelSave: '保存参数', reset: '恢复自动识别',
      resetHint: '清除此渠道中该模型的全部自定义参数。', modelSaved: '模型参数已更新', modelReset: '已恢复自动识别',
      inherited: '留空使用自动识别或默认值', positiveInteger: '请输入大于 0 的整数',
      originExact: '目录精确匹配', originPrefix: '按基础模型匹配', originNone: '暂无能力数据',
      generationEmpty: '还没有生成记录', generationHint: '在对话中使用生图或视频工具，结果会保存在这里。',
      tasks: '视频任务', submitting: '提交中', queued: '排队中', in_progress: '生成中', completed: '已完成',
      task_failed: '生成失败', 'download-pending': '已生成，等待下载重试', 'download-failed': '已生成，下载未成功',
      previewOmitted: '图片已生成；为保护签名信息，未直接展示下载链接。请勿因没有预览而重复生成。',
      'submit-unknown': '提交结果未知，可能已计费', expired: '已超时', issues: '连接诊断',
      imageCard: '生成图片', videoCard: '生成视频', videoStatusCard: '视频任务状态', generating: '生成中…',
      close: '关闭', updated: '数据时间', stale: '上次数据', privacy: '密钥不回显',
      savingBlocked: '请先等待当前操作完成', nameRequired: '请填写渠道名称', addressRequired: '请填写完整的 http:// 或 https:// 地址',
      tokenRequired: '请填写 API 令牌', changeDiscard: '放弃未保存的修改？', detail: '详细信息',
      fetchModels: '获取模型列表', batchTest: '批量测试', addManual: '手动添加', stopTest: '停止测试',
      autoModeHint: '当前渠道仍为自动模式：显示网关返回的全部模型。首次添加或删除模型后，会保存为此渠道的模型清单。',
      listModeHint: '只有清单中的模型会出现在模型选择器和生成工具里。网关新增的模型需要通过「获取模型列表」添加。',
      discoverTitle: '获取模型列表', discoverHint: '从网关读取当前全部模型，勾选后加入此渠道的清单。只读取目录，不产生费用。',
      discovering: '正在读取网关模型…', discoverFailed: '读取失败', statusEnabled: '已添加', statusNew: '新增', statusMissing: '网关已下架',
      selectAllNew: '全选新增', clearSelection: '清空选择', addSelected: '添加所选', removeMissing: '移除已下架', nothingNew: '网关没有新的模型',
      selectedCount: '已选', groupChat: '对话模型', groupImage: '生图模型', groupVideo: '视频模型', groupOther: '其他模型',
      discoverSearch: '搜索模型 ID 或厂商', discoverStatus: '按状态筛选', discoverKind: '按类型筛选',
      selectShown: '全选当前', resetFilter: '清除筛选', discoverNoMatch: '没有符合当前筛选的模型',
      discoverShown: (shown, total, picked) => `显示 ${shown} / ${total}${picked ? ` · 已选 ${picked}` : ''}`,
      missingBadge: '网关已下架', customBadge: '手动添加', test: '测试', testingModel: '测试中', testOk: '可用', testFail: '失败',
      firstByte: '首包', total: '总耗时', testedAt: '测试于', neverTested: '未测试', testError: '测试失败',
      paidTitle: '这次测试会产生费用', paidImage: '将真实生成 1 张图片，按网关的生图价格计费。结果只显示在这里，不会保存为附件。',
      paidVideo: '将真实提交 1 个视频生成任务，通常费用较高、需要几分钟。任务结果会出现在「生成记录」。提交后无法在此取消。',
      pendingTest: '待完成', acceptedTest: '任务已接受，尚未验证生成结果', checkGeneration: '请到生成记录查看进度',
      paidConfirm: '确认并测试', unsupportedTest: '此类型模型暂不支持测试',
      batchTitle: '批量测试对话模型', batchHint: (n) => `将测试 ${n} 个对话模型，每个发送一次极短请求（每次产生少量费用），最多同时 3 个；停止后不再发送后续请求，已发送的请求仍会完成并可能计费。`,
      batchStart: '开始测试', batchProgress: (d, n) => `已测试 ${d}/${n}`, batchDone: (ok, fail) => `完成：${ok} 个可用，${fail} 个失败`, batchNone: '当前筛选下没有对话模型',
      removeModel: '删除', removeTitle: '从此渠道删除模型', removeHint: '只从此渠道的清单中移除，不影响网关和其他渠道。',
      keepParams: '保留此模型的自定义参数（以后重新添加时恢复）', removeConfirm: '删除', modelRemoved: (id) => `已删除 ${id}`, undo: '撤销', undone: '已恢复',
      manualTitle: '手动添加模型', manualHint: '用于网关目录里没有列出、但可以调用的模型。', modelId: '模型 ID', modelIdRequired: '请填写模型 ID',
      modelExists: '清单里已有这个模型', manualAdd: '添加', addedModels: (n) => `已添加 ${n} 个模型`, removedMissing: (n) => `已移除 ${n} 个下架模型`,
      code_AUTH: '令牌无效或无权限', code_NO_CHANNEL: '网关没有可用渠道', code_RATE_LIMIT: '请求过于频繁', code_TIMEOUT: '超时', code_UNREACHABLE: '无法连接网关', code_HTTP: '请求失败',
    };
    const EN = {
      nav: 'New API Provider', title: 'New API Provider', subtitle: 'Your model gateways, quota and creative tools, in one place.',
      refresh: 'Sync data', refreshing: 'Syncing…', add: 'Add gateway', channels: 'Gateways', models: 'Model capabilities', media: 'Generations',
      channelHint: 'One gateway is active at a time; models, balance and generation tools follow it. Submitted videos stay on their original gateway.', activateShort: 'Activate', activeTip: 'Active gateway', inactiveTip: 'Not active', healthOk: 'Connected; quota is up to date',
      healthNoKey: 'No token stored yet', healthBad: 'Connection problem', healthStale: 'Quota data is stale', healthUnknown: 'Not checked yet',
      activateTip: 'Switch to this gateway', channelTestTip: 'Test connection (reads the model list only; no charge)', editChannelTip: 'Edit gateway settings', removeChannelTip: 'Remove this gateway',
      modelsOfChannel: 'Gateway', viewingInactive: 'Viewing an inactive gateway\'s model list. Edits are saved to that gateway; chats still use the active one.',
      channelModelsHint: 'Each gateway keeps its own model list and parameters.', loadingModels: 'Reading this gateway\'s models…', modelsLoadFailed: 'Could not read models',
      modelTestChatTip: 'Test this model (one tiny request; a small charge)', modelTestPaidTip: 'Test this model (real generation; asks to confirm)',
      active: 'Active', inactive: 'Inactive', activate: 'Activate', edit: 'Edit', remove: 'Remove', cancel: 'Cancel', confirmRemove: 'Remove gateway',
      deleteHint: 'Removes configuration only, not the credential or upstream account.', lastChannel: 'Keep at least one gateway',
      activateHint: 'Switching affects every session using this plugin. Submitted videos keep their original gateway.',
      currentChannel: 'Active gateway', tokenUsed: 'Token total used', tokenRemaining: 'Token quota remaining', accountBalance: 'Account balance',
      unlimited: 'Unlimited token', totalModels: 'Discovered models', chat: 'Chat', image: 'Image', video: 'Video', audio: 'Audio', embedding: 'Embedding', other: 'Other',
      all: 'All', text: 'Text', pdf: 'PDF', inputImage: 'Image', inputVideo: 'Video', inputAudio: 'Audio',
      credentialSet: 'Credential set', credentialMissing: 'No credential', failed: 'Connection issue', loading: 'Loading…', retry: 'Retry',
      sidebarBalanceHint: 'Click to refresh the quota',
      loadFailed: 'Could not read gateway data', loadFailedHint: 'If DSH was just restarted, make sure the plugin is loaded and try again.',
      cached: 'Cached', balanceUnavailable: 'Quota unavailable', notFetched: 'Not queried', used: 'Used', remaining: 'Remaining',
      accountHint: 'To see account balance, enable “Allow user quota query” in the token settings on New API.',
      activeName: 'Gateway', route: 'Model route', unknown: 'Unknown', save: 'Save', saving: 'Saving…',
      newChannel: 'Add New API gateway', editChannel: 'Edit gateway', channelName: 'Gateway name', channelNamePlaceholder: 'Primary, backup…',
      address: 'Gateway URL', addressHint: 'Use the site root or an address ending in /v1.',
      apiKey: 'API token', keyPlaceholder: 'sk-…', keyUnchanged: 'Leave blank to keep the stored credential',
      keyHint: 'Stored only in DSH credentials. Never echoed or saved in gateway configuration.', activateOnSave: 'Activate after saving',
      connectionSection: 'Connection', credentialSection: 'Credential', keyRequiredForAddress: 'The gateway address changed. For safety, enter this gateway\'s token again.',
      keyWillReplace: 'The new token replaces the stored one on save', showKey: 'Show', hideKey: 'Hide',
      testConnection: 'Test connection', testing: 'Testing…', testPassed: 'Connected', testHint: 'Queries the model list only; no paid model call.',
      editHint: 'Each gateway keeps its own URL, credential and model overrides.', newHint: 'Connect with your existing New API site URL and token.',
      conflict: 'Another window changed the configuration. Close the editor and refresh before retrying.', saved: 'Gateway saved', activated: 'Active gateway changed', removed: 'Gateway removed',
      filter: 'Search model or vendor', modelsHint: 'Models belong to the active gateway. models.dev metadata does not guarantee upstream support; correct it per model as needed.',
      namingSection: 'Naming & mapping', capacitySection: 'Limits & capabilities', advancedOptions: 'Advanced options',
      localModelId: 'Local model ID', upstreamModel: 'Upstream model name', upstreamHint: 'The model sent to the gateway. Leave blank to use the local ID; existing sessions keep their model identity.',
      displayNameHint: 'Changes the DSH label only, not the request.', mappingPreview: 'Request target', mapped: 'Mapped', noMapping: 'No mapping · original ID',
      invalidMapping: 'Use at most 500 characters without whitespace or control characters.',
      automaticMode: 'Auto', customMode: 'Custom', followAuto: 'Follow model catalog', enableReasoning: 'Enabled', disableReasoning: 'Disabled',
      protocolLabel: 'Request protocol', mappingMetadataHint: 'On save, automatic capabilities are resolved for the new target. Manual overrides still take precedence.',
      resetAsk: 'Confirm reset', resetDescription: 'Clears all overrides, including display name, upstream mapping, limits and capabilities.', unsaved: 'Unsaved changes',
      model: 'Model', capabilities: 'Capabilities & context', source: 'Capability source', parameters: 'Parameters', context: 'Context window', maxOutput: 'Max output',
      reasoning: 'Reasoning', noReasoning: 'No reasoning declared', auto: 'Automatic', overridden: 'Customized', defaults: 'Default',
      modelEmpty: 'No matching models', noModels: 'No model catalog for this gateway', hidden: 'Hidden', modelEdit: 'Edit model', modelEditHint: 'Changes this model on this gateway only, not the New API site.',
      kind: 'Model kind', displayName: 'Display name', inputModalities: 'Input capabilities', inputHint: 'DSH chat accepts text and image. PDF, video and audio tags are informational only.',
      reasoningEnabled: 'Declare reasoning support', hideModel: 'Hide model', modelSave: 'Save parameters', reset: 'Use automatic values',
      resetHint: 'Removes all overrides for this model on this gateway.', modelSaved: 'Model parameters updated', modelReset: 'Automatic values restored',
      inherited: 'Leave empty for automatic or default values', positiveInteger: 'Enter a positive integer',
      originExact: 'Exact catalog match', originPrefix: 'Base-model match', originNone: 'No capability metadata',
      generationEmpty: 'No generations yet', generationHint: 'Generate an image or video in chat; saved results appear here.',
      tasks: 'Video tasks', submitting: 'Submitting', queued: 'Queued', in_progress: 'Generating', completed: 'Completed',
      task_failed: 'Generation failed', 'download-pending': 'Generated; download retry pending', 'download-failed': 'Generated; download unsuccessful',
      previewOmitted: 'Image generated. The signed URL is withheld for privacy; do not regenerate just because a preview is unavailable.',
      'submit-unknown': 'Submission unknown; may be billed', expired: 'Timed out', issues: 'Connection diagnostics',
      imageCard: 'Image generation', videoCard: 'Video generation', videoStatusCard: 'Video status', generating: 'Generating…',
      close: 'Close', updated: 'Updated', stale: 'Last known data', privacy: 'Tokens stay private',
      savingBlocked: 'Wait for the current operation', nameRequired: 'Enter a gateway name', addressRequired: 'Enter a complete http:// or https:// URL',
      tokenRequired: 'Enter an API token', changeDiscard: 'Discard unsaved changes?', detail: 'Details',
      fetchModels: 'Fetch models', batchTest: 'Test all', addManual: 'Add manually', stopTest: 'Stop',
      autoModeHint: 'This gateway is in automatic mode and shows every model the gateway lists. Adding or removing a model saves a model list for this gateway.',
      listModeHint: 'Only models in this list appear in the model picker and generation tools. Use "Fetch models" to add new gateway models.',
      discoverTitle: 'Fetch models', discoverHint: 'Reads every model the gateway lists. Select models to add to this gateway. Reads the catalog only; no charge.',
      discovering: 'Reading gateway models…', discoverFailed: 'Could not read models', statusEnabled: 'Added', statusNew: 'New', statusMissing: 'Removed upstream',
      selectAllNew: 'Select all new', clearSelection: 'Clear', addSelected: 'Add selected', removeMissing: 'Remove missing', nothingNew: 'No new models on the gateway',
      selectedCount: 'Selected', groupChat: 'Chat models', groupImage: 'Image models', groupVideo: 'Video models', groupOther: 'Other models',
      discoverSearch: 'Search model ID or vendor', discoverStatus: 'Filter by status', discoverKind: 'Filter by kind',
      selectShown: 'Select shown', resetFilter: 'Clear filters', discoverNoMatch: 'No models match these filters',
      discoverShown: (shown, total, picked) => `Showing ${shown} of ${total}${picked ? ` · ${picked} selected` : ''}`,
      missingBadge: 'Removed upstream', customBadge: 'Added manually', test: 'Test', testingModel: 'Testing', testOk: 'Works', testFail: 'Failed',
      firstByte: 'First byte', total: 'Total', testedAt: 'Tested', neverTested: 'Not tested', testError: 'Test failed',
      paidTitle: 'This test is billed', paidImage: 'Generates 1 real image at the gateway\'s image price. The result is shown here only and not saved as an attachment.',
      paidVideo: 'Submits 1 real video task, which is usually expensive and takes minutes. The result appears under Generations. It cannot be cancelled here.',
      pendingTest: 'Pending', acceptedTest: 'Accepted; generation not yet verified', checkGeneration: 'Check progress under Generations',
      paidConfirm: 'Confirm and test', unsupportedTest: 'Testing is not available for this model type',
      batchTitle: 'Test chat models', batchHint: (n) => `Tests ${n} chat models with one tiny request each (each is billed a small amount), 3 at a time. Stop prevents queued calls; already sent requests finish and may be billed.`,
      batchStart: 'Start', batchProgress: (d, n) => `Tested ${d}/${n}`, batchDone: (ok, fail) => `Done: ${ok} working, ${fail} failed`, batchNone: 'No chat models in the current filter',
      removeModel: 'Remove', removeTitle: 'Remove model from this gateway', removeHint: 'Removes it from this gateway\'s list only. The gateway and other gateways are unaffected.',
      keepParams: 'Keep this model\'s custom parameters (restored if you add it again)', removeConfirm: 'Remove', modelRemoved: (id) => `Removed ${id}`, undo: 'Undo', undone: 'Restored',
      manualTitle: 'Add a model manually', manualHint: 'For models the gateway can call but does not list.', modelId: 'Model ID', modelIdRequired: 'Enter a model ID',
      modelExists: 'This model is already in the list', manualAdd: 'Add', addedModels: (n) => `Added ${n} models`, removedMissing: (n) => `Removed ${n} missing models`,
      code_AUTH: 'Invalid token or no permission', code_NO_CHANNEL: 'No available upstream channel', code_RATE_LIMIT: 'Rate limited', code_TIMEOUT: 'Timed out', code_UNREACHABLE: 'Gateway unreachable', code_HTTP: 'Request failed',
    };
    let locale;
    let translate;
    /** Only plain strings go to the DSH dictionary; counted phrases are functions resolved here. */
    const stringsOnly = (dict) => Object.fromEntries(Object.entries(dict).filter(([, v]) => typeof v === 'string'));
    const activeDict = () => (String(locale?.getSnapshot?.()?.active || 'zh').toLowerCase().startsWith('zh') ? ZH : EN);
    function tf(key, ...args) {
      const v = activeDict()[key] ?? ZH[key];
      return typeof v === 'function' ? v(...args) : (v ?? key);
    }
    function useT() {
      const [, rerender] = useState(0);
      useEffect(() => locale?.subscribe(() => rerender((x) => x + 1)), []);
      return (key) => translate?.(key) ?? ZH[key] ?? key;
    }
    const ICONS = {
      plus: 'M12 5v14M5 12h14', refresh: 'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3a7 7 0 0 0 11.6-1',
      check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6', edit: 'm15 5 4 4M4 20l4-1L20 7a2.1 2.1 0 0 0-3-3L5 16Z',
      gateway: 'M4 4h16v6H4zM4 14h16v6H4zM7 7h.01M7 17h.01M15 7h2M15 17h2',
      key: 'M14 4a6 6 0 1 1-4 10l-6 6H2v-3l6-6a6 6 0 0 1 6-7ZM16 7h.01',
      search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
      grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
      image: 'M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M16 8h.01', video: 'M3 5h18v14H3zM8 5v14M16 5v14M3 9h5M3 15h5M16 9h5M16 15h5',
      arrow: 'M5 12h14m-5-5 5 5-5 5', trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
      info: 'M12 10v7M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
      download: 'M12 4v12m-5-5 5 5 5-5M4 20h16', play: 'M7 4v16l13-8z', bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
      stopwatch: 'M9 2h6M12 2v3M18 6l2-2M20 13a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM12 9v4l3 2',
      power: 'M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0',
      gauge: 'm12 14 4-4M3.34 19a10 10 0 1 1 17.32 0',
      heartPulse: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7ZM3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27',
      heart: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
      wallet: 'M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1M3 7.5V18a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5.5A2.5 2.5 0 0 1 3 7.5ZM16 13h.01',
      heartCrack: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7ZM12 13l-1-1 2-2-3-3 2-2',
      document: 'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6',
      audio: 'M5 10v4M9 6v12M13 3v18M17 7v10M21 10v4',
      stop: 'M6 6h12v12H6z', alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    };
    function Icon({ name, size = 16, spin = false }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: spin ? 'nas-spin' : undefined }, h('path', { d: ICONS[name] || ICONS.info }));
    }
    /**
     * Vendor marks: LobeHub Icons (@lobehub/icons-static-svg 1.97.0, MIT,
     * https://github.com/lobehub/lobe-icons), inlined so the page makes no remote
     * image requests. Brand marks belong to their owners and only identify the vendor.
     */
    const VENDOR_SVG = {
      deepseek: "<path d=\"M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z\" fill=\"#4D6BFE\"></path>",
      openai: "<path d=\"M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z\"></path>",
      claude: "<path d=\"M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z\" fill=\"#D97757\" fill-rule=\"nonzero\"></path>",
      gemini: "<path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"#3186FF\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-0-_R_0_)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-1-_R_0_)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#lobe-icons-gemini-2-_R_0_)\"></path><defs><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-0-_R_0_\" x1=\"7\" x2=\"11\" y1=\"15.5\" y2=\"12\"><stop stop-color=\"#08B962\"></stop><stop offset=\"1\" stop-color=\"#08B962\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-1-_R_0_\" x1=\"8\" x2=\"11.5\" y1=\"5.5\" y2=\"11\"><stop stop-color=\"#F94543\"></stop><stop offset=\"1\" stop-color=\"#F94543\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"lobe-icons-gemini-2-_R_0_\" x1=\"3.5\" x2=\"17.5\" y1=\"13.5\" y2=\"12\"><stop stop-color=\"#FABC12\"></stop><stop offset=\".46\" stop-color=\"#FABC12\" stop-opacity=\"0\"></stop></linearGradient></defs>",
      qwen: "<path d=\"M19.713 2.825h-5.907c0-.251-.066-.503-.196-.728L12.819.728A1.46 1.46 0 0 0 11.559 0h-1.58c-.52 0-1 .275-1.26.728l-2.42 4.19a1.45 1.45 0 0 0 0 1.453l.791 1.37c.26.448.74.727 1.26.727h11.36c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451l-.79-1.37a1.46 1.46 0 0 0-1.26-.728zM.195 9.905l2.951 5.115a1.46 1.46 0 0 0-.531.531l-.791 1.37a1.45 1.45 0 0 0 0 1.452l.79 1.37c.26.448.74.727 1.26.727h4.84c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451L5.086 7.083a1.46 1.46 0 0 0-1.26-.728h-1.58c-.52 0-1 .276-1.26.728l-.79 1.37a1.45 1.45 0 0 0 0 1.452m15.888 13.367 2.951-5.115c.217.125.469.196.728.196h1.582c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451l-2.42-4.191a1.46 1.46 0 0 0-1.259-.728h-1.582c-.52 0-1 .276-1.259.728l-5.678 9.838a1.45 1.45 0 0 0 0 1.452l.79 1.37c.26.448.74.727 1.26.727h1.582c.52 0 1-.275 1.26-.728z\" fill=\"#082dff\"></path>",
      zhipu: "<path d=\"M11.991 23.503a.24.24 0 00-.244.248.24.24 0 00.244.249.24.24 0 00.245-.249.24.24 0 00-.22-.247l-.025-.001zM9.671 5.365a1.697 1.697 0 011.099 2.132l-.071.172-.016.04-.018.054c-.07.16-.104.32-.104.498-.035.71.47 1.279 1.186 1.314h.366c1.309.053 2.338 1.173 2.286 2.523-.052 1.332-1.152 2.38-2.478 2.327h-.174c-.715.018-1.274.64-1.239 1.368 0 .124.018.23.053.337.209.373.54.658.96.8.75.23 1.517-.125 1.9-.782l.018-.035c.402-.64 1.17-.96 1.92-.711.854.284 1.378 1.226 1.099 2.167a1.661 1.661 0 01-2.077 1.102 1.711 1.711 0 01-.907-.711l-.017-.035c-.2-.323-.463-.58-.851-.711l-.056-.018a1.646 1.646 0 00-1.954.746 1.66 1.66 0 01-1.065.764 1.677 1.677 0 01-1.989-1.279c-.209-.906.332-1.83 1.257-2.043a1.51 1.51 0 01.296-.035h.018c.68-.071 1.151-.622 1.116-1.333a1.307 1.307 0 00-.227-.693 2.515 2.515 0 01-.366-1.403 2.39 2.39 0 01.366-1.208c.14-.195.21-.444.227-.693.018-.71-.506-1.261-1.186-1.332l-.07-.018a1.43 1.43 0 01-.299-.07l-.05-.019a1.7 1.7 0 01-1.047-2.114 1.68 1.68 0 012.094-1.101zm-5.575 10.11c.26-.264.639-.367.994-.27.355.096.633.379.728.74.095.362-.007.748-.267 1.013-.402.41-1.053.41-1.455 0a1.062 1.062 0 010-1.482zm14.845-.294c.359-.09.738.024.992.297.254.274.344.665.237 1.025-.107.36-.396.634-.756.718-.551.128-1.1-.22-1.23-.781a1.05 1.05 0 01.757-1.26zm-.064-4.39c.314.32.49.753.49 1.206 0 .452-.176.886-.49 1.206-.315.32-.74.5-1.185.5-.444 0-.87-.18-1.184-.5a1.727 1.727 0 010-2.412 1.654 1.654 0 012.369 0zm-11.243.163c.364.484.447 1.128.218 1.691a1.665 1.665 0 01-2.188.923c-.855-.36-1.26-1.358-.907-2.228a1.68 1.68 0 011.33-1.038c.593-.08 1.183.169 1.547.652zm11.545-4.221c.368 0 .708.2.892.524.184.324.184.724 0 1.048a1.026 1.026 0 01-.892.524c-.568 0-1.03-.47-1.03-1.048 0-.579.462-1.048 1.03-1.048zm-14.358 0c.368 0 .707.2.891.524.184.324.184.724 0 1.048a1.026 1.026 0 01-.891.524c-.569 0-1.03-.47-1.03-1.048 0-.579.461-1.048 1.03-1.048zm10.031-1.475c.925 0 1.675.764 1.675 1.706s-.75 1.705-1.675 1.705-1.674-.763-1.674-1.705c0-.942.75-1.706 1.674-1.706zm-2.626-.684c.362-.082.653-.356.761-.718a1.062 1.062 0 00-.238-1.028 1.017 1.017 0 00-.996-.294c-.547.14-.881.7-.752 1.257.13.558.675.907 1.225.783zm0 16.876c.359-.087.644-.36.75-.72a1.062 1.062 0 00-.237-1.019 1.018 1.018 0 00-.985-.301 1.037 1.037 0 00-.762.717c-.108.361-.017.754.239 1.028.245.263.606.377.953.305l.043-.01zM17.19 3.5a.631.631 0 00.628-.64c0-.355-.279-.64-.628-.64a.631.631 0 00-.628.64c0 .355.28.64.628.64zm-10.38 0a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64a.631.631 0 00-.628.64c0 .355.279.64.628.64zm-5.182 7.852a.631.631 0 00-.628.64c0 .354.28.639.628.639a.63.63 0 00.627-.606l.001-.034a.62.62 0 00-.628-.64zm5.182 9.13a.631.631 0 00-.628.64c0 .355.279.64.628.64a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64zm10.38.018a.631.631 0 00-.628.64c0 .355.28.64.628.64a.631.631 0 00.628-.64c0-.355-.279-.64-.628-.64zm5.182-9.148a.631.631 0 00-.628.64c0 .354.279.639.628.639a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64zm-.384-4.992a.24.24 0 00.244-.249.24.24 0 00-.244-.249.24.24 0 00-.244.249c0 .142.122.249.244.249zM11.991.497a.24.24 0 00.245-.248A.24.24 0 0011.99 0a.24.24 0 00-.244.249c0 .133.108.236.223.247l.021.001zM2.011 6.36a.24.24 0 00.245-.249.24.24 0 00-.244-.249.24.24 0 00-.244.249.24.24 0 00.244.249zm0 11.263a.24.24 0 00-.243.248.24.24 0 00.244.249.24.24 0 00.244-.249.252.252 0 00-.244-.248zm19.995-.018a.24.24 0 00-.245.248.24.24 0 00.245.25.24.24 0 00.244-.25.252.252 0 00-.244-.248z\" fill=\"#3859FF\" fill-rule=\"nonzero\"></path>",
      kimi: "<path d=\"M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z\" fill=\"#1783FF\"></path><path d=\"M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z\" fill=\"currentColor\"></path>",
      doubao: "<path d=\"M5.31 15.756c.172-3.75 1.883-5.999 2.549-6.739-3.26 2.058-5.425 5.658-6.358 8.308v1.12C1.501 21.513 4.226 24 7.59 24a6.59 6.59 0 002.2-.375c.353-.12.7-.248 1.039-.378.913-.899 1.65-1.91 2.243-2.992-4.877 2.431-7.974.072-7.763-4.5l.002.001z\" fill=\"#1E37FC\"></path><path d=\"M22.57 10.283c-1.212-.901-4.109-2.404-7.397-2.8.295 3.792.093 8.766-2.1 12.773a12.782 12.782 0 01-2.244 2.992c3.764-1.448 6.746-3.457 8.596-5.219 2.82-2.683 3.353-5.178 3.361-6.66a2.737 2.737 0 00-.216-1.084v-.002z\" fill=\"#37E1BE\"></path><path d=\"M14.303 1.867C12.955.7 11.248 0 9.39 0 7.532 0 5.883.677 4.545 1.807 2.791 3.29 1.627 5.557 1.5 8.125v9.201c.932-2.65 3.097-6.25 6.357-8.307.5-.318 1.025-.595 1.569-.829 1.883-.801 3.878-.932 5.746-.706-.222-2.83-.718-5.002-.87-5.617h.001z\" fill=\"#A569FF\"></path><path d=\"M17.305 4.961a199.47 199.47 0 01-1.08-1.094c-.202-.213-.398-.419-.586-.622l-1.333-1.378c.151.615.648 2.786.869 5.617 3.288.395 6.185 1.898 7.396 2.8-1.306-1.275-3.475-3.487-5.266-5.323z\" fill=\"#1E37FC\"></path>",
      meta: "<path d=\"M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z\" fill=\"url(#lobe-icons-meta-0-_R_0_)\"></path><path d=\"M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z\" fill=\"url(#lobe-icons-meta-1-_R_0_)\"></path><path d=\"M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z\" fill=\"url(#lobe-icons-meta-2-_R_0_)\"></path><path d=\"M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z\" fill=\"url(#lobe-icons-meta-3-_R_0_)\"></path><path d=\"M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z\" fill=\"url(#lobe-icons-meta-4-_R_0_)\"></path><path d=\"M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z\" fill=\"url(#lobe-icons-meta-5-_R_0_)\"></path><path d=\"M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z\" fill=\"#0082FB\"></path><path d=\"M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z\" fill=\"url(#lobe-icons-meta-6-_R_0_)\"></path><path d=\"M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z\" fill=\"#0082FB\"></path><path d=\"M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z\" fill=\"url(#lobe-icons-meta-7-_R_0_)\"></path><path d=\"M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z\" fill=\"url(#lobe-icons-meta-8-_R_0_)\"></path><path d=\"M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z\" fill=\"url(#lobe-icons-meta-9-_R_0_)\"></path><path d=\"M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z\" fill=\"url(#lobe-icons-meta-10-_R_0_)\"></path><path d=\"M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z\" fill=\"url(#lobe-icons-meta-11-_R_0_)\"></path><path d=\"M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z\" fill=\"url(#lobe-icons-meta-12-_R_0_)\"></path><defs><linearGradient id=\"lobe-icons-meta-0-_R_0_\" x1=\"75.897%\" x2=\"26.312%\" y1=\"89.199%\" y2=\"12.194%\"><stop offset=\".06%\" stop-color=\"#0867DF\"></stop><stop offset=\"45.39%\" stop-color=\"#0668E1\"></stop><stop offset=\"85.91%\" stop-color=\"#0064E0\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-1-_R_0_\" x1=\"21.67%\" x2=\"97.068%\" y1=\"75.874%\" y2=\"23.985%\"><stop offset=\"13.23%\" stop-color=\"#0064DF\"></stop><stop offset=\"99.88%\" stop-color=\"#0064E0\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-2-_R_0_\" x1=\"38.263%\" x2=\"60.895%\" y1=\"89.127%\" y2=\"16.131%\"><stop offset=\"1.47%\" stop-color=\"#0072EC\"></stop><stop offset=\"68.81%\" stop-color=\"#0064DF\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-3-_R_0_\" x1=\"47.032%\" x2=\"52.15%\" y1=\"90.19%\" y2=\"15.745%\"><stop offset=\"7.31%\" stop-color=\"#007CF6\"></stop><stop offset=\"99.43%\" stop-color=\"#0072EC\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-4-_R_0_\" x1=\"52.155%\" x2=\"47.591%\" y1=\"58.301%\" y2=\"37.004%\"><stop offset=\"7.31%\" stop-color=\"#007FF9\"></stop><stop offset=\"100%\" stop-color=\"#007CF6\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-5-_R_0_\" x1=\"37.689%\" x2=\"61.961%\" y1=\"12.502%\" y2=\"63.624%\"><stop offset=\"7.31%\" stop-color=\"#007FF9\"></stop><stop offset=\"100%\" stop-color=\"#0082FB\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-6-_R_0_\" x1=\"34.808%\" x2=\"62.313%\" y1=\"68.859%\" y2=\"23.174%\"><stop offset=\"27.99%\" stop-color=\"#007FF8\"></stop><stop offset=\"91.41%\" stop-color=\"#0082FB\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-7-_R_0_\" x1=\"43.762%\" x2=\"57.602%\" y1=\"6.235%\" y2=\"98.514%\"><stop offset=\"0%\" stop-color=\"#0082FB\"></stop><stop offset=\"99.95%\" stop-color=\"#0081FA\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-8-_R_0_\" x1=\"60.055%\" x2=\"39.88%\" y1=\"4.661%\" y2=\"69.077%\"><stop offset=\"6.19%\" stop-color=\"#0081FA\"></stop><stop offset=\"100%\" stop-color=\"#0080F9\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-9-_R_0_\" x1=\"30.282%\" x2=\"61.081%\" y1=\"59.32%\" y2=\"33.244%\"><stop offset=\"0%\" stop-color=\"#027AF3\"></stop><stop offset=\"100%\" stop-color=\"#0080F9\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-10-_R_0_\" x1=\"20.433%\" x2=\"82.112%\" y1=\"50.001%\" y2=\"50.001%\"><stop offset=\"0%\" stop-color=\"#0377EF\"></stop><stop offset=\"99.94%\" stop-color=\"#0279F1\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-11-_R_0_\" x1=\"40.303%\" x2=\"72.394%\" y1=\"35.298%\" y2=\"57.811%\"><stop offset=\".19%\" stop-color=\"#0471E9\"></stop><stop offset=\"100%\" stop-color=\"#0377EF\"></stop></linearGradient><linearGradient id=\"lobe-icons-meta-12-_R_0_\" x1=\"32.254%\" x2=\"68.003%\" y1=\"19.719%\" y2=\"84.908%\"><stop offset=\"27.65%\" stop-color=\"#0867DF\"></stop><stop offset=\"100%\" stop-color=\"#0471E9\"></stop></linearGradient></defs>",
      mistral: "<path d=\"M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z\" fill=\"gold\"></path><path d=\"M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z\" fill=\"#FFAF00\"></path><path d=\"M3.428 10.258h17.144v3.428H3.428v-3.428z\" fill=\"#FF8205\"></path><path d=\"M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z\" fill=\"#FA500F\"></path><path d=\"M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z\" fill=\"#E10500\"></path>",
      xai: "<path d=\"M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z\"></path>",
      minimax: "<defs><linearGradient id=\"lobe-icons-minimax-_R_0_\" x1=\"0%\" x2=\"100.182%\" y1=\"50.057%\" y2=\"50.057%\"><stop offset=\"0%\" stop-color=\"#E2167E\"></stop><stop offset=\"100%\" stop-color=\"#FE603C\"></stop></linearGradient></defs><path d=\"M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z\" fill=\"url(#lobe-icons-minimax-_R_0_)\" fill-rule=\"nonzero\"></path>",
      hunyuan: "<circle cx=\"12\" cy=\"12\" fill=\"#0055E9\" r=\"12\"></circle><path d=\"M12 0c.518 0 1.028.033 1.528.096A6.188 6.188 0 0112.12 12.28l-.12.001c-2.99 0-5.242 2.179-5.554 5.11-.223 2.086.353 4.412 2.242 6.146C3.672 22.1 0 17.479 0 12 0 5.373 5.373 0 12 0z\" fill=\"#A8DFF5\"></path><path d=\"M5.286 5a2.438 2.438 0 01.682 3.38c-3.962 5.966-3.215 10.743 2.648 15.136C3.636 22.056 0 17.452 0 12c0-1.787.39-3.482 1.09-5.006.253-.435.525-.872.817-1.311A2.438 2.438 0 015.286 5z\" fill=\"#0055E9\"></path><path d=\"M12.98.04c.272.021.543.053.81.093.583.106 1.117.254 1.538.44 6.638 2.927 8.07 10.052 1.748 15.642a4.125 4.125 0 01-5.822-.358c-1.51-1.706-1.3-4.184.357-5.822.858-.848 3.108-1.223 4.045-2.441 1.257-1.634 2.122-6.009-2.523-7.506L12.98.039z\" fill=\"#00BCFF\"></path><path d=\"M13.528.096A6.187 6.187 0 0112 12.281a5.75 5.75 0 00-1.71.255c.147-.905.595-1.784 1.321-2.501.858-.848 3.108-1.223 4.045-2.441 1.27-1.651 2.14-6.104-2.676-7.554.184.014.367.033.548.056z\" fill=\"#ECECEE\"></path>",
    };
    // Gateway vendor name first, then model id. Order matters: specific before generic.
    const VENDOR_RULES = [
      ["deepseek", "DeepSeek", /deepseek/],
      ["claude", "Anthropic", /anthropic|claude/],
      ["gemini", "Google", /google|gemini|gemma|veo|imagen/],
      ["openai", "OpenAI", /openai|^gpt|^o[1-9](\b|-)|^chatgpt|codex|dall-?e|sora|whisper|^tts-/],
      ["qwen", "Qwen", /qwen|tongyi|alibaba|aliyun|wan[0-9x]/],
      ["zhipu", "Zhipu", /zhipu|glm|chatglm|cogview|cogvideo/],
      ["kimi", "Moonshot", /moonshot|kimi/],
      ["doubao", "Doubao", /doubao|bytedance|volc|seedream|seedance|skylark/],
      ["meta", "Meta", /meta|llama/],
      ["mistral", "Mistral", /mistral|mixtral|codestral|pixtral|magistral/],
      ["xai", "xAI", /xai|grok/],
      ["minimax", "MiniMax", /minimax|abab|hailuo/],
      ["hunyuan", "Tencent", /hunyuan|tencent/],
    ];
    function vendorOf(vendor, modelId) {
      for (const text of [vendor, modelId]) {
        const raw = String(text || "").toLowerCase();
        if (!raw) continue;
        const hit = VENDOR_RULES.find(([, , re]) => re.test(raw));
        if (hit) return { key: hit[0], label: vendor || hit[1] };
      }
      return { key: null, label: vendor || modelId || "" };
    }
    let vendorSeq = 0;
    function VendorIcon({ vendor, modelId, size = 18 }) {
      const { key, label } = vendorOf(vendor, modelId);
      // Gradient ids must be unique per rendered instance, or several icons on one page collide.
      const uid = useRef(null);
      if (uid.current == null) uid.current = `nasv${++vendorSeq}`;
      const markup = key ? VENDOR_SVG[key].replace(/(id="|url\(#)([^")]+)/g, (_, p, id) => `${p}${uid.current}-${id}`) : null;
      return h("span", { className: `nas-vendor-mark ${key ? "" : "unknown"}`, "data-tip": label, "data-tip-align": "start", role: "img", "aria-label": label },
        markup
          ? h("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", fillRule: "evenodd", "aria-hidden": true, dangerouslySetInnerHTML: { __html: markup } })
          : h(Icon, { name: "grid", size: size - 2 }));
    }
    const CSS = `
      .nas{--nas-line:var(--dsw-alias-border-l1);--nas-text:var(--dsw-alias-label-primary);--nas-sub:var(--dsw-alias-label-secondary);--nas-bg:var(--dsw-alias-bg-layer-1);--nas-raised:var(--dsw-alias-bg-layer-2);--nas-brand:var(--dsw-alias-brand-primary);--nas-accent:#2f6feb;color:var(--nas-text);font:inherit;font-size:13px;line-height:1.55;width:100%;min-width:0;box-sizing:border-box}
      .nas *{box-sizing:border-box}.nas button,.nas input,.nas select{font:inherit}.nas button{cursor:pointer}.nas button:disabled{cursor:default;opacity:.55}.nas button:focus-visible,.nas input:focus-visible,.nas select:focus-visible,.nas [tabindex]:focus-visible{outline:2px solid var(--nas-brand);outline-offset:3px}
      .nas-page{padding:4px 2px 28px;max-width:1080px;margin:0 auto}.nas-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:22px}.nas-head h2{font-size:23px;line-height:1.3;font-weight:650;letter-spacing:-.6px;margin:0 0 6px}.nas-sub{color:var(--nas-sub);font-size:12px}.nas-eyebrow{display:flex;align-items:center;gap:6px;font-size:11px;letter-spacing:.09em;color:var(--nas-sub);margin-bottom:7px}.nas-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.nas-btn{min-height:32px;border:1px solid var(--nas-line);background:var(--nas-bg);color:var(--nas-text);padding:5px 11px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;gap:6px;line-height:1.4;white-space:nowrap;transition:background .12s,border-color .12s}.nas-btn:hover{background:var(--nas-raised);border-color:var(--dsw-alias-border-l2)}.nas-btn.primary{background:var(--nas-brand);border-color:var(--nas-brand);color:var(--dsw-alias-bg-base)}.nas-btn.primary:hover{opacity:.9}.nas-btn.ghost{background:transparent}.nas-btn.danger{color:var(--dsw-alias-state-error-primary)}.nas-btn.small{min-height:28px;font-size:12px;padding:3px 9px}.nas-icon-btn{padding:5px;min-width:29px}
      .nas-summary{display:grid;grid-template-columns:1.1fr 1fr .85fr;border:1px solid var(--nas-line);border-radius:11px;background:var(--nas-bg);margin-bottom:22px;overflow:hidden}.nas-stat{padding:16px 19px;min-width:0}.nas-stat+.nas-stat{border-left:1px solid var(--nas-line)}.nas-stat-label{font-size:11px;color:var(--nas-sub);margin-bottom:7px}.nas-stat-value{font-size:21px;font-variant-numeric:tabular-nums;line-height:1.3;letter-spacing:-.4px;overflow-wrap:anywhere}.nas-stat-value.name{font-size:17px;font-weight:600}.nas-stat-foot{font-size:11px;color:var(--nas-sub);margin-top:5px;overflow-wrap:anywhere}
      .nas-tabs{display:flex;gap:24px;border-bottom:1px solid var(--nas-line);margin-bottom:18px}.nas-tab{display:flex;align-items:center;gap:7px;padding:10px 1px 12px;background:transparent;border:0;border-bottom:2px solid transparent;color:var(--nas-sub);font-weight:500}.nas-tab.selected{color:var(--nas-text);border-bottom-color:var(--nas-brand)}.nas-count{font-size:10px;min-width:18px;padding:0 5px;background:var(--nas-raised);border-radius:4px;color:var(--nas-sub);font-variant-numeric:tabular-nums}.nas-section-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 15px}.nas-section-intro p{margin:0;color:var(--nas-sub);font-size:12px;max-width:660px}
      .nas-channels{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px}.nas-channel{position:relative;border:1px solid var(--nas-line);border-radius:10px;background:var(--nas-bg);padding:16px;min-width:0;display:flex;flex-direction:column;gap:13px}.nas-channel.is-active{border-color:var(--nas-brand);box-shadow:inset 3px 0 var(--nas-brand)}.nas-channel-top{display:flex;align-items:center;gap:10px}.nas-channel-mark{width:34px;height:34px;border-radius:8px;background:var(--nas-raised);color:var(--nas-sub);display:flex;align-items:center;justify-content:center;flex-shrink:0}.nas-channel.is-active .nas-channel-mark{color:var(--nas-brand)}.nas-channel-title{flex:1;min-width:0}.nas-channel-title strong{font-size:14px;font-weight:600;display:block;overflow-wrap:anywhere}.nas-url{font-size:11px;color:var(--nas-sub);overflow-wrap:anywhere;line-height:1.5}.nas-channel-meta{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:11px;color:var(--nas-sub)}.nas-dot{width:5px;height:5px;border-radius:50%;background:var(--nas-sub);display:inline-block;flex-shrink:0}.nas-dot.ok{background:var(--dsw-alias-state-success-primary)}.nas-dot.warn{background:var(--dsw-alias-state-warn-primary)}.nas-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;line-height:18px;border-radius:4px;padding:0 6px;background:var(--nas-raised);color:var(--nas-sub);white-space:nowrap}.nas-badge.active{color:var(--nas-brand);background:color-mix(in srgb,var(--nas-brand) 9%,transparent)}.nas-badge.warn{color:var(--dsw-alias-state-warn-primary)}.nas-badge.good{color:var(--dsw-alias-state-success-primary)}.nas-badge.error{color:var(--dsw-alias-state-error-primary)}.nas-channel-quota{font-size:19px;letter-spacing:-.3px;font-variant-numeric:tabular-nums}.nas-channel-bottom{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--nas-line);padding-top:12px;margin-top:auto;gap:10px}.nas-note{display:flex;gap:7px;align-items:flex-start;color:var(--nas-sub);font-size:11px;line-height:1.6;margin-top:14px}.nas-note svg{flex-shrink:0;margin-top:2px}.nas-empty{padding:36px 20px;border:1px dashed var(--nas-line);border-radius:10px;text-align:center;color:var(--nas-sub);font-size:13px}.nas-empty svg{display:block;margin:0 auto 10px}.nas-empty strong{display:block;color:var(--nas-text);font-weight:500;margin:8px 0}.nas-error{border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,transparent);color:var(--dsw-alias-state-error-primary);background:var(--nas-bg);padding:10px 12px;border-radius:7px;font-size:12px;overflow-wrap:anywhere;white-space:pre-wrap}.nas-feedback{display:flex;align-items:center;gap:7px;border:1px solid var(--nas-line);padding:9px 12px;border-radius:7px;color:var(--dsw-alias-state-success-primary);font-size:12px;margin-bottom:15px}
      .nas-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px}.nas-search{display:flex;align-items:center;gap:8px;flex:1;min-width:180px;border:1px solid var(--nas-line);background:var(--nas-bg);padding:0 10px;border-radius:7px;color:var(--nas-sub)}.nas-search input{border:0;outline:0;background:transparent;padding:7px 0;color:var(--nas-text);width:100%;font-size:12px;min-width:0}.nas-search:focus-within{border-color:var(--nas-brand);box-shadow:0 0 0 3px color-mix(in srgb,var(--nas-brand) 14%,transparent)}.nas-search input:focus,.nas-search input:focus-visible{outline:0}.nas-filter{display:flex;gap:3px;flex-wrap:wrap}.nas-filter button{border:0;background:transparent;border-radius:5px;padding:5px 8px;color:var(--nas-sub);font-size:12px}.nas-filter button[aria-pressed=true]{background:var(--nas-raised);color:var(--nas-text)}.nas-models{border:1px solid var(--nas-line);border-radius:9px}.nas-model-head.v2{border-radius:8px 8px 0 0}.nas-model-row.v2:last-child{border-radius:0 0 8px 8px}.nas-model-head,.nas-model-row{display:grid;grid-template-columns:minmax(150px,1.25fr) minmax(150px,1.1fr) minmax(90px,.7fr) 32px;gap:16px;align-items:center;padding:11px 14px}.nas-model-head{background:var(--nas-raised);font-size:11px;color:var(--nas-sub);padding-top:8px;padding-bottom:8px}.nas-model-row+.nas-model-row{border-top:1px solid var(--nas-line)}.nas-model-row{background:var(--nas-bg)}.nas-model-name{font-weight:500;font-size:12px;overflow-wrap:anywhere;line-height:1.55}.nas-model-badges{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.nas-model-cap{font-size:11px;color:var(--nas-sub)}.nas-model-cap strong{font-weight:550;color:var(--nas-text);font-variant-numeric:tabular-nums}.nas-model-source{font-size:11px;color:var(--nas-sub)}.nas-hide{opacity:.6}.nas-model-sub{font-size:10px;color:var(--nas-sub);margin-top:2px}.nas-settings-foot{display:flex;align-items:center;flex-wrap:wrap;justify-content:space-between;gap:8px;color:var(--nas-sub);font-size:10px;border-top:1px solid var(--nas-line);padding-top:12px;margin-top:22px}.nas-gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}.nas-gallery figure{margin:0;border:1px solid var(--nas-line);border-radius:8px;overflow:hidden}.nas-gallery img,.nas-gallery video{display:block;width:100%;height:150px;object-fit:contain;background:var(--nas-raised)}.nas-gallery figcaption{padding:8px;font-size:11px;color:var(--nas-sub);overflow-wrap:anywhere}.nas-task{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--nas-line)}
      .nas-dialog{max-width:580px;width:calc(100% - 40px);max-height:calc(100vh - 64px);border:1px solid var(--nas-line);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--nas-text);padding:0;overflow:auto;box-shadow:0 16px 60px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent)}.nas-dialog::backdrop{background:color-mix(in srgb,var(--dsw-alias-bg-base) 60%,transparent);backdrop-filter:blur(3px)}.nas-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px 14px}.nas-dialog-head h3{margin:0 0 5px;font-size:17px;font-weight:600}.nas-dialog-body{padding:4px 24px 20px}.nas-dialog-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:14px 24px;border-top:1px solid var(--nas-line);background:var(--nas-bg)}.nas-field{display:flex;flex-direction:column;gap:6px;margin-bottom:16px;font-size:12px}.nas-field>label{font-weight:500}.nas-field small{font-size:11px;color:var(--nas-sub);font-weight:400}.nas-field input:not([type=checkbox]),.nas-field select{width:100%;height:35px;border:1px solid var(--nas-line);border-radius:6px;background:var(--nas-bg);color:var(--nas-text);padding:6px 10px;min-width:0;outline:none}.nas-field input:focus,.nas-field select:focus{border-color:var(--nas-brand)}.nas-fieldset{border:0;padding:0;margin:0 0 16px}.nas-fieldset legend{font-weight:500;font-size:12px;margin-bottom:8px}.nas-checks{display:flex;gap:12px;flex-wrap:wrap}.nas-check{display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;color:var(--nas-text);font-weight:400}.nas-check input{accent-color:var(--nas-brand);width:14px;height:14px;margin:0}.nas-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.nas-field-error{color:var(--dsw-alias-state-error-primary);font-size:11px}.nas-test{border:1px solid var(--nas-line);border-radius:7px;padding:11px 12px;font-size:12px;margin-top:12px}.nas-test.ok strong{color:var(--dsw-alias-state-success-primary)}.nas-test.bad{color:var(--dsw-alias-state-error-primary)}.nas-test small{display:block;color:var(--nas-sub);margin-top:3px}.nas-prompt{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--nas-sub);margin-top:8px}.nas-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--nas-sub);background:transparent;border:1px solid var(--nas-line);border-radius:7px;padding:2px 8px;cursor:pointer}.nas-preview{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.nas-preview img,.nas-preview video{display:block;max-width:100%;max-height:280px;border-radius:8px;border:1px solid var(--nas-line)}.nas-spin{animation:nas-spin .9s linear infinite}@keyframes nas-spin{to{transform:rotate(360deg)}}
      @media(max-width:760px){.nas-head{flex-direction:column;gap:12px}.nas-head h2{font-size:20px}.nas-stat{padding:13px}.nas-stat-value{font-size:18px}.nas-summary{grid-template-columns:1fr 1fr}.nas-stat:last-child{grid-column:1/-1;border-left:0;border-top:1px solid var(--nas-line)}.nas-model-head,.nas-model-row{grid-template-columns:minmax(110px,1fr) minmax(140px,1fr) 29px;gap:10px;padding:10px}.nas-model-head>:nth-child(3),.nas-model-row>.nas-model-source{display:none}.nas-tabs{gap:18px}.nas-two{grid-template-columns:1fr;gap:0}.nas-dialog-head{padding:18px 18px 12px}.nas-dialog-body{padding:4px 18px 16px}.nas-dialog-foot{padding:12px 18px}.nas-discover .nas-dialog-body{padding:0 18px}}
      .nas-model-head.v2,.nas-model-row.v2{grid-template-columns:minmax(160px,1.3fr) minmax(150px,1.1fr) minmax(120px,.85fr) auto}.nas-row-actions{display:flex;align-items:center;gap:2px;justify-content:flex-end}.nas-row-actions .nas-btn{border-color:transparent;background:transparent}.nas-row-actions .nas-btn:hover{border-color:var(--nas-line);background:var(--nas-raised)}
      .nas-test-cell{font-size:11px;color:var(--nas-sub);line-height:1.5;min-width:0}.nas-test-cell .ok{color:var(--dsw-alias-state-success-primary)}.nas-test-cell .bad{color:var(--dsw-alias-state-error-primary)}.nas-test-cell .num{font-variant-numeric:tabular-nums;color:var(--nas-text)}.nas-test-err{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
      .nas-mode{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--nas-line);border-radius:8px;padding:9px 12px;font-size:12px;color:var(--nas-sub);margin-bottom:12px;background:var(--nas-bg)}.nas-mode svg{flex-shrink:0;margin-top:2px}
      .nas-toast{position:sticky;bottom:12px;margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--nas-line);background:var(--dsw-alias-bg-overlay);border-radius:9px;padding:9px 12px;font-size:12px;box-shadow:0 6px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);z-index:2}
      .nas-progress{height:3px;border-radius:2px;background:var(--nas-raised);overflow:hidden;margin:6px 0 2px}.nas-progress>i{display:block;height:100%;background:var(--nas-brand);transition:width .2s}
      .nas-dialog.wide{max-width:760px}
      /* Model discovery: fixed toolbar and action bar, one scrolling result list. */
      .nas-dialog.nas-discover{display:flex;flex-direction:column;overflow:hidden;max-width:760px;background:var(--nas-bg)}
      .nas-discover .nas-dialog-head{flex-shrink:0;padding-bottom:12px}
      .nas-discover .nas-dialog-body{display:flex;flex-direction:column;gap:9px;flex:1 1 auto;min-height:0;overflow:hidden;padding:0 24px}
      .nas-discover .nas-dialog-foot{flex-shrink:0}
      .nas-discover-tools{display:flex;flex-direction:column;gap:8px;flex-shrink:0}
      .nas-discover-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;min-height:22px}
      .nas-preview-test img{max-width:220px;max-height:220px;border-radius:8px;border:1px solid var(--nas-line);display:block;margin-top:8px}
      /* Compact model list: identity / capacity / connectivity / actions. */
      .nas-models{container-type:inline-size}.nas-model-head.v2,.nas-model-row.v2{grid-template-columns:minmax(120px,1fr) minmax(110px,.75fr) 96px 84px;gap:12px;padding:10px 12px}.nas-model-row.v2{min-height:48px}.nas-model-head.v2{font-size:10px;padding-top:8px;padding-bottom:8px}.nas-model-head.v2>:nth-child(3){display:block}.nas-model-identity{display:flex;align-items:center;gap:9px;min-width:0}.nas-vendor-mark{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;color:var(--nas-text);flex-shrink:0}.nas-vendor-mark>svg{display:block}.nas-vendor-mark.unknown{color:var(--nas-sub);opacity:.7}.nas-model-row.v2 .nas-model-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;line-height:1.5;font-weight:500;letter-spacing:-.1px}.nas-status-mark{color:var(--dsw-alias-state-warn-primary);display:inline-flex;flex-shrink:0}.nas-model-cap.compact{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px;line-height:1.5}.nas-cap-numbers{font-variant-numeric:tabular-nums;color:var(--nas-text);white-space:nowrap;font-weight:500}.nas-cap-divider{color:var(--nas-sub);font-weight:400}.nas-cap-icons{display:inline-flex;align-items:center;gap:5px;color:var(--nas-sub)}.nas-cap-icons>span{display:inline-flex}.nas-test-cell.compact{display:flex;align-items:center;gap:7px;white-space:nowrap;line-height:1.5;font-size:11px}.nas-test-status{display:inline-flex;align-items:center;gap:4px}.nas-test-status.pending{color:var(--dsw-alias-state-warn-primary)}.nas-result-dot{width:5px;height:5px;border-radius:50%;background:currentColor;display:inline-block}.nas-model-row.v2 .nas-row-actions{gap:0}.nas-model-row.v2 .nas-row-actions .nas-btn{min-width:28px;width:28px;min-height:28px;padding:4px}
      @container(max-width:520px){.nas-model-head.v2,.nas-model-row.v2{grid-template-columns:minmax(80px,1fr) 88px 84px;gap:8px;padding-left:10px;padding-right:10px}.nas-model-head.v2>:nth-child(2),.nas-model-row.v2>.nas-model-cap{display:none}.nas-model-head.v2>:nth-child(3){display:block}}
      .nas-dialog.nas-model-editor{max-width:620px;background:var(--nas-bg)}.nas-model-editor .nas-dialog-head{padding-bottom:16px}.nas-model-editor .nas-dialog-head h3{font-size:18px}.nas-model-editor .nas-dialog-foot{position:sticky;bottom:0;z-index:1;background:var(--nas-bg)}.nas-editor-identity{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:0 0 18px;border:1px solid var(--nas-line);border-radius:8px;background:var(--dsw-alias-bg-base)}.nas-editor-identity .nas-vendor-mark{width:26px;height:26px}.nas-editor-identity .nas-sub{font-size:10px;margin-bottom:3px}.nas-editor-identity code{font-family:inherit;font-size:12px;overflow-wrap:anywhere}.nas-editor-section{border-top:1px solid var(--nas-line);padding-top:16px;margin-top:16px}.nas-editor-section-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;margin-bottom:14px}.nas-editor-section-title>span{font-size:10px;color:var(--nas-sub);font-weight:400;letter-spacing:.06em}.nas-model-editor .nas-field{gap:5px;margin-bottom:14px}.nas-model-editor .nas-field input:not([type=checkbox]),.nas-model-editor .nas-field select{height:37px;background:var(--dsw-alias-bg-base)}.nas-number-field{position:relative}.nas-number-field input{padding-right:55px!important;font-variant-numeric:tabular-nums}.nas-number-field>span{position:absolute;right:10px;top:9px;color:var(--nas-sub);font-size:10px;pointer-events:none}.nas-mapping-preview{border-radius:7px;background:var(--nas-raised);padding:10px 12px;margin:0 0 4px}.nas-mapping-preview>.nas-sub{font-size:10px}.nas-mapping-path{display:flex;align-items:center;gap:10px;margin-top:5px;min-width:0}.nas-mapping-path code{font:inherit;font-size:11px;overflow-wrap:anywhere;min-width:0;flex:1}.nas-mapping-path svg{flex-shrink:0;color:var(--nas-sub)}.nas-mapping-path code.mapped{color:var(--nas-brand)}.nas-editor-cap-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;font-size:12px;font-weight:500}.nas-segment{display:flex;border:1px solid var(--nas-line);padding:2px;border-radius:6px;gap:2px;background:var(--dsw-alias-bg-base)}.nas-segment button{border:0;background:transparent;color:var(--nas-sub);border-radius:4px;padding:3px 9px;font-size:10px;line-height:1.4}.nas-segment button[aria-pressed=true]{background:var(--nas-raised);color:var(--nas-text)}.nas-modality-options{display:flex;flex-wrap:wrap;gap:6px}.nas-modality-options button{display:flex;align-items:center;gap:5px;border:1px solid var(--nas-line);background:var(--dsw-alias-bg-base);color:var(--nas-sub);padding:5px 9px;border-radius:6px;font-size:11px}.nas-modality-options button.selected{border-color:color-mix(in srgb,var(--nas-brand) 35%,var(--nas-line));color:var(--nas-brand);background:color-mix(in srgb,var(--nas-brand) 5%,var(--nas-bg))}.nas-modality-options button:disabled{opacity:1;cursor:default}.nas-editor-advanced{border-top:1px solid var(--nas-line);padding:14px 0 2px;margin-top:6px}.nas-editor-advanced summary{cursor:pointer;font-size:12px;color:var(--nas-sub)}.nas-editor-advanced[open] summary{margin-bottom:15px}.nas-editor-dirty{width:5px;height:5px;background:var(--dsw-alias-state-warn-primary);border-radius:50%;margin-right:2px}.nas-editor-reset{display:flex;gap:8px;align-items:flex-start;font-size:11px;color:var(--dsw-alias-state-warn-primary);background:var(--nas-raised);padding:10px;border-radius:6px;margin-top:12px}.nas-editor-reset svg{flex-shrink:0}.nas-model-editor .nas-error{margin-top:12px}
      .nas-dialog.nas-channel-editor{max-width:560px}.nas-editor-section.first{border-top:0;padding-top:0;margin-top:0}.nas-channel-editor .nas-editor-identity .nas-channel-mark{width:32px;height:32px;color:var(--nas-brand)}.nas-input-icon{position:relative;display:flex;align-items:center}.nas-input-icon>svg{position:absolute;left:11px;color:var(--nas-sub);pointer-events:none}.nas-input-icon input{padding-left:33px!important;padding-right:56px!important}.nas-input-toggle{position:absolute;right:6px;border:0;background:transparent;color:var(--nas-sub);font-size:11px;padding:4px 7px;border-radius:5px}.nas-input-toggle:hover{background:var(--nas-raised);color:var(--nas-text)}.nas-key-state{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--nas-sub);margin:-4px 0 4px}
      .nas-activate-row{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid var(--nas-line);border-radius:8px;padding:11px 14px;margin-top:16px;cursor:pointer;background:var(--dsw-alias-bg-base)}.nas-activate-row strong{font-size:12px;font-weight:500}.nas-activate-row .nas-sub{font-size:11px;margin-top:2px}.nas-activate-row input{appearance:none;flex-shrink:0;width:32px;height:18px;border-radius:9px;background:var(--dsw-alias-border-l2);position:relative;cursor:pointer;transition:background .15s;margin:0}.nas-activate-row input::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .15s}.nas-activate-row input:checked{background:var(--nas-brand)}.nas-activate-row input:checked::after{transform:translateX(14px)}
      .nas-test-panel{border:1px solid var(--nas-line);border-radius:8px;margin-top:16px;overflow:hidden}.nas-test-head{display:flex;align-items:center;gap:10px;padding:10px 14px;font-size:12px}.nas-test-badge{display:inline-flex;align-items:center;gap:5px;font-weight:600}.nas-test-panel.ok .nas-test-badge{color:var(--dsw-alias-state-success-primary)}.nas-test-panel.bad .nas-test-badge{color:var(--dsw-alias-state-error-primary)}.nas-test-head .num{font-variant-numeric:tabular-nums;color:var(--nas-sub)}.nas-test-stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--nas-line)}.nas-test-stat{padding:10px 14px;display:flex;flex-direction:column;gap:2px}.nas-test-stat+.nas-test-stat{border-left:1px solid var(--nas-line)}.nas-test-stat strong{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.2}.nas-test-stat span{font-size:10px;color:var(--nas-sub)}.nas-test-error{border-top:1px solid var(--nas-line);padding:10px 14px;font-size:11px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;white-space:pre-wrap}
      /* Channel rows: one active marker (ring + brand name), a health heart, and hover tooltips. */
      .nas-ch-wrap{container-type:inline-size;position:relative}
      .nas-ch-list{border:1px solid var(--nas-line);border-radius:10px;background:var(--nas-bg)}
      .nas-ch-row{position:relative;display:grid;grid-template-columns:26px minmax(0,1fr) minmax(0,auto) 72px auto;align-items:center;gap:12px;padding:9px 12px;min-height:54px}
      .nas-ch-row:first-child{border-radius:9px 9px 0 0}
      .nas-ch-row:last-child{border-radius:0 0 9px 9px}
      .nas-ch-row+.nas-ch-row{border-top:1px solid var(--nas-line)}
      .nas-ch-row:hover{background:color-mix(in srgb,var(--nas-raised) 55%,transparent)}
      .nas-ch-row.is-active{background:color-mix(in srgb,var(--nas-accent) 5%,transparent);box-shadow:inset 0 0 0 1px var(--nas-accent)}
      .nas-ch-mark{width:26px;height:26px;border-radius:7px;background:var(--nas-raised);color:var(--nas-sub);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
      .nas-ch-row.is-active .nas-ch-mark{color:var(--nas-accent);background:color-mix(in srgb,var(--nas-accent) 10%,transparent)}
      .nas-ch-id{min-width:0}
      .nas-ch-name{display:block;font-size:13px;font-weight:600;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nas-ch-row.is-active .nas-ch-name{color:var(--nas-accent)}
      .nas-ch-url{font-size:11px;color:var(--nas-sub);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nas-ch-quota{text-align:right;min-width:0;font-variant-numeric:tabular-nums;line-height:1.4}
      .nas-ch-amount{display:block;font-size:13px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nas-ch-quota-label{display:block;font-size:10px;color:var(--nas-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nas-ch-quota.bad .nas-ch-amount{color:var(--dsw-alias-state-error-primary);font-size:12px}
      .nas-ch-health{display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;font-size:11px;color:var(--nas-sub);font-variant-numeric:tabular-nums}
      .nas-ch-health.ok{color:var(--dsw-alias-state-success-primary)}
      .nas-ch-health.warn{color:var(--dsw-alias-state-warn-primary)}
      .nas-ch-health.bad{color:var(--dsw-alias-state-error-primary)}
      .nas-ch-health svg{flex-shrink:0}
      .nas-ch-actions{display:flex;align-items:center;justify-content:flex-end;gap:2px}
      .nas-ch-actions .nas-icon-btn{border-color:transparent;background:transparent;min-width:28px;width:28px;min-height:28px;padding:4px}
      .nas-ch-actions .nas-icon-btn:hover{border-color:var(--nas-line);background:var(--nas-raised)}
      .nas-ch-slot{display:inline-block;width:28px;height:28px}
      .nas-ch-actions.confirm{gap:6px}
      .nas-ch-actions.confirm .nas-sub{font-size:11px;white-space:nowrap}
      /* Models tab: pick whose list to view; each gateway keeps its own. */
      .nas-model-channels{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}
      .nas-model-channel{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--nas-line);background:var(--nas-bg);color:var(--nas-sub);border-radius:7px;padding:5px 10px;font-size:12px;line-height:1.4;max-width:240px}
      .nas-model-channel>span:not(.nas-count){white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nas-model-channel:hover{background:var(--nas-raised);color:var(--nas-text)}
      .nas-model-channel.selected{color:var(--nas-text);border-color:var(--dsw-alias-border-l2);background:var(--nas-raised);font-weight:500}
      .nas-model-channel.is-active svg{color:var(--nas-accent)}
      .nas-mode.warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,var(--nas-line))}
      /* Model discovery: same visual language as the model table. */
      .nas-discover .nas-dialog-head{padding-bottom:14px}
      .nas-discover .nas-dialog-body{display:flex;flex-direction:column;gap:10px;min-height:0}
      .nas-discover-tools{display:flex;flex-direction:column;gap:8px;flex-shrink:0}
      .nas-discover-scroll{border:1px solid var(--nas-line);border-radius:9px;background:var(--dsw-alias-bg-base);max-height:min(48vh,420px);overflow:auto;overscroll-behavior:contain}
      .nas-dlist{padding:2px 0}
      .nas-dgroup{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:10px;letter-spacing:.04em;color:var(--nas-sub);background:var(--nas-raised);border-bottom:1px solid var(--nas-line)}
      .nas-dgroup:not(:first-child){border-top:1px solid var(--nas-line)}
      .nas-drow{display:grid;grid-template-columns:16px 18px minmax(0,1fr) auto;align-items:center;gap:10px;padding:9px 12px;font-size:12px;cursor:pointer;line-height:1.45}
      .nas-drow+.nas-drow{border-top:1px solid var(--nas-line)}
      .nas-drow:hover{background:color-mix(in srgb,var(--nas-raised) 60%,transparent)}
      .nas-drow.locked{cursor:default}
      .nas-drow.locked:hover{background:transparent}
      .nas-drow.locked .nas-drow-id{color:var(--nas-sub);font-weight:400}
      .nas-drow input{accent-color:var(--nas-accent);width:14px;height:14px;margin:0}
      .nas-drow.on{background:color-mix(in srgb,var(--nas-accent) 4%,transparent)}
      .nas-drow-mark{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-state-warn-primary)}
      .nas-drow-main{min-width:0}
      .nas-drow-id{display:flex;align-items:center;gap:6px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nas-drow-id>span{overflow:hidden;text-overflow:ellipsis}
      .nas-drow-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--nas-sub);margin-top:1px}
      .nas-drow-kind{padding:0 5px;border-radius:4px;background:var(--nas-raised);line-height:16px}
      .nas-drow-num{font-variant-numeric:tabular-nums}
      .nas-drow-meta .nas-cap-icons{gap:4px}
      .nas-discover-blank{display:flex;flex-direction:column;align-items:center;gap:8px;padding:34px 16px;color:var(--nas-sub);font-size:12px;text-align:center}
      .nas-skeleton{display:flex;flex-direction:column;gap:9px;padding:16px 12px}
      .nas-skeleton>i{display:block;height:14px;border-radius:5px;background:var(--nas-raised);animation:nas-pulse 1.2s ease-in-out infinite}
      @keyframes nas-pulse{50%{opacity:.45}}
      /* Sidebar-foot balance: one compact row, two densities. */
      .nas-side-balance{display:block;width:100%;min-width:0}
      .nas-side-balance-btn{display:flex;align-items:center;gap:8px;width:100%;min-width:0;border:1px solid transparent;background:transparent;color:var(--nas-text);border-radius:8px;padding:6px 8px;text-align:left;line-height:1.35;transition:background .12s,border-color .12s}
      .nas-side-balance-btn:hover{background:var(--nas-raised);border-color:var(--nas-line)}
      .nas-side-balance-btn:focus-visible{outline:2px solid var(--nas-brand);outline-offset:2px}
      .nas-side-balance-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex-shrink:0}
      .nas-side-balance-dot.ok{background:var(--dsw-alias-state-success-primary)}
      .nas-side-balance-dot.warn{background:var(--dsw-alias-state-warn-primary)}
      .nas-side-balance-main{display:flex;flex-direction:column;min-width:0;flex:1}
      .nas-side-balance-name{font-size:11px;color:var(--nas-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nas-side-balance-value{font-size:12px;font-weight:550;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .nas-side-balance-icon{display:inline-flex;color:var(--nas-sub);flex-shrink:0}
      .nas-side-balance[data-wide=no] .nas-side-balance-btn{justify-content:center;padding:6px 0;gap:0}
      .nas-side-balance[data-wide=no] .nas-side-balance-icon{display:none}
      /* Tooltips: instant, themed, keyboard accessible. */
      .nas [data-tip]{position:relative}
      .nas [data-tip]::after{content:attr(data-tip);position:absolute;z-index:60;bottom:calc(100% + 9px);left:50%;transform:translateX(-50%);width:max-content;max-width:270px;padding:6px 9px;border-radius:7px;border:1px solid var(--nas-line);background:var(--dsw-alias-bg-overlay);color:var(--nas-text);font-size:11px;font-weight:400;line-height:1.55;text-align:left;white-space:pre-line;box-shadow:0 8px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent);opacity:0;pointer-events:none;transition:opacity .12s}
      .nas [data-tip]::before{content:"";position:absolute;z-index:60;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);border:5px solid transparent;border-top-color:var(--dsw-alias-bg-overlay);opacity:0;pointer-events:none;transition:opacity .12s}
      .nas [data-tip]:hover::after,.nas [data-tip]:hover::before,.nas [data-tip]:focus-visible::after,.nas [data-tip]:focus-visible::before{opacity:1}
      .nas [data-tip][data-tip-align=start]::after{left:0;transform:none}
      .nas [data-tip][data-tip-align=start]::before{left:12px;transform:none}
      .nas [data-tip][data-tip-align=end]::after{left:auto;right:0;transform:none}
      .nas [data-tip][data-tip-align=end]::before{left:auto;right:12px;transform:none}
      @container(max-width:620px){.nas-ch-row{gap:10px}.nas-ch-health span{display:none}.nas-ch-amount{font-size:12px}.nas-ch-actions .nas-icon-btn{min-width:26px;width:26px}}
      @container(max-width:430px){.nas-ch-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 64px auto;gap:8px}.nas-ch-mark{display:none}.nas-ch-amount{overflow:hidden;text-overflow:ellipsis}.nas-ch-actions .nas-icon-btn{min-width:26px;width:26px}}
      @media(max-width:520px){.nas-test-stats{grid-template-columns:repeat(2,1fr)}.nas-test-stat:nth-child(3){border-left:0;border-top:1px solid var(--nas-line)}.nas-test-stat:nth-child(4){border-top:1px solid var(--nas-line)}}
      @media(prefers-reduced-motion:reduce){.nas-spin{animation:none}.nas-btn{transition:none}.nas-progress>i{transition:none}.nas-activate-row input,.nas-activate-row input::after{transition:none}}
    `;
    function Styles() { return h('style', null, CSS); }
    function apiUrl(path) {
      const u = new URL(document.baseURI);
      u.search = ''; u.hash = '';
      if (!u.pathname.endsWith('/')) u.pathname += '/';
      return new URL(`newapi-provider/api/${path}`, u).href;
    }
    async function api(path, body, signal) {
      const response = await fetch(apiUrl(path), {
        method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal,
        headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let value; try { value = await response.json(); } catch { /* explicit HTTP failure below */ }
      if (!response.ok) throw Object.assign(new Error(value?.error || `HTTP ${response.status}`), { status: response.status });
      if (!value) throw new Error('Invalid response');
      return value;
    }
    const store = {
      state: undefined, error: undefined, busy: false, listeners: new Set(), controller: undefined, timer: undefined, epoch: 0,
      emit() { for (const fn of this.listeners) fn(); },
      async load() {
        if (this.busy || this.controller) return;
        const controller = new AbortController(); this.controller = controller; const epoch = this.epoch;
        try { const s = await api('state', undefined, controller.signal); if (epoch === this.epoch) { this.state = s; this.error = undefined; } }
        catch (e) { if (!controller.signal.aborted && epoch === this.epoch) this.error = e.message; }
        finally { if (this.controller === controller) this.controller = undefined; this.emit(); }
      },
      async mutate(path, body = {}, { update = true } = {}) {
        if (this.busy) throw new Error(translate('savingBlocked'));
        this.busy = true; this.epoch++; this.controller?.abort(); this.controller = undefined; this.emit();
        try {
          const value = await api(path, body);
          if (update) { this.state = value; this.error = undefined; }
          return value;
        } finally { this.busy = false; this.emit(); }
      },
      subscribe(fn) {
        this.listeners.add(fn);
        if (this.listeners.size === 1) {
          void this.load();
          this.timer = setInterval(() => { if (!document.hidden) void this.load(); }, 30_000);
        }
        return () => {
          this.listeners.delete(fn);
          if (!this.listeners.size) { clearInterval(this.timer); this.controller?.abort(); this.controller = undefined; }
        };
      },
      dispose() { clearInterval(this.timer); this.controller?.abort(); this.listeners.clear(); },
    };
    function useProvider() {
      const [, set] = useState(0);
      useEffect(() => store.subscribe(() => set((n) => n + 1)), []);
      return { state: store.state, error: store.error, busy: store.busy };
    }
    function useAction() {
      const t = useT(); const [error, setError] = useState(''); const [pending, setPending] = useState(false);
      async function run(fn) {
        setError(''); setPending(true);
        try { return await fn(); }
        catch (e) { setError(e.status === 409 ? t('conflict') : e.message); return undefined; }
        finally { setPending(false); }
      }
      return { run, pending, error, clear: () => setError('') };
    }
    function money(value, currency) {
      if (value == null || !Number.isFinite(value)) return '—';
      const lang = String(locale?.getSnapshot()?.active || 'zh');
      const intl = lang.startsWith('zh') ? 'zh-CN' : 'en-US';
      if (currency?.unit === 'TOKENS') return Math.round(value).toLocaleString(intl);
      return `${currency?.symbol || '$'}${value.toLocaleString(intl, { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2 })}`;
    }
    function tokens(n) { return !n ? '—' : n >= 1e6 ? `${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n); }
    function quota(b) {
      if (!b?.token || !['ok', 'stale'].includes(b.status)) return { label: 'balanceUnavailable', value: '—' };
      if (b.user?.remaining != null) return { label: 'accountBalance', value: money(b.user.remaining, b.currency) };
      if (!b.token.unlimited) return { label: 'tokenRemaining', value: money(b.token.remaining, b.currency) };
      return { label: 'tokenUsed', value: money(b.token.used, b.currency) };
    }
    function Badge({ tone = '', children }) { return h('span', { className: `nas-badge ${tone}` }, children); }
    /** `tip` shows a styled hover/focus tooltip and doubles as the accessible name. */
    function Button({ icon, children, tone = '', small = false, tip, tipAlign, ...props }) {
      const tipProps = tip ? { 'data-tip': tip, 'aria-label': props['aria-label'] ?? tip, ...(tipAlign ? { 'data-tip-align': tipAlign } : {}) } : {};
      return h('button', { type: 'button', ...props, ...tipProps, className: `nas-btn ${tone} ${small ? 'small' : ''} ${props.className || ''}` }, icon && h(Icon, { name: icon, size: small ? 13 : 14, spin: props['aria-busy'] }), children);
    }
    function ErrorText({ text }) { return text ? h('div', { className: 'nas-error', role: 'alert' }, text) : null; }
    function Empty({ title, detail, icon = 'grid', action }) { return h('div', { className: 'nas-empty' }, h(Icon, { name: icon, size: 25 }), h('strong', null, title), detail && h('p', null, detail), action); }
    function Modal({ title, hint, onClose, children, footer, busy = false, dirty = false, wide = false, className = '' }) {
      const ref = useRef(); const titleId = useId(); const t = useT(); const opener = useRef();
      const close = () => { if (!busy && (!dirty || window.confirm(t('changeDiscard')))) onClose(); };
      const closeRef = useRef(close); closeRef.current = close;
      const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
      // Unmounting also fires the native close event; do not report that as a user close.
      const unmounting = useRef(false);
      useEffect(() => {
        opener.current = document.activeElement;
        const el = ref.current;
        el.showModal();
        // Focus the field marked data-autofocus: React's autoFocus ran before showModal.
        (el.querySelector('[data-autofocus]') ?? el.querySelector('.nas-dialog-body input, .nas-dialog-body select') ?? el).focus?.();
        return () => { unmounting.current = true; el.close(); opener.current?.focus?.(); };
      }, []);
      // A native close that bypasses onCancel (repeated Escape) must also close React's state,
      // or the editor stays mounted, invisible, and cannot be reopened.
      return h('dialog', { ref, className: `nas nas-dialog ${wide ? 'wide' : ''} ${className}`, 'aria-labelledby': titleId,
        onCancel: (e) => { e.preventDefault(); closeRef.current(); },
        onClose: () => { if (!unmounting.current && ref.current?.open === false) onCloseRef.current?.(); } },
        h(Styles), h('div', { className: 'nas-dialog-head' },
          h('div', null, h('h3', { id: titleId }, title), hint && h('div', { className: 'nas-sub' }, hint)),
          h(Button, { icon: 'close', className: 'nas-icon-btn', 'aria-label': t('close'), disabled: busy, onClick: close })),
        h('div', { className: 'nas-dialog-body' }, children),
        footer && h('div', { className: 'nas-dialog-foot' }, footer));
    }
    function Field({ label, hint, error, children, htmlFor }) {
      return h('div', { className: 'nas-field' }, h('label', { htmlFor }, label), children, hint && h('small', null, hint), error && h('span', { className: 'nas-field-error' }, error));
    }
    function Check({ checked, onChange, children, disabled }) {
      return h('label', { className: 'nas-check' }, h('input', { type: 'checkbox', checked: Boolean(checked), onChange: (e) => onChange(e.target.checked), disabled }), children);
    }
    function ChannelEditor({ channel, revision, onClose, onSaved }) {
      const t = useT(); const prefix = useId();
      const [form, setForm] = useState({ name: channel?.name || '', baseURL: channel?.baseURL || '', apiKey: '', activate: false });
      const [tested, setTested] = useState(); const [validation, setValidation] = useState('');
      const [op, setOp] = useState(''); const [showKey, setShowKey] = useState(false); const a = useAction();
      const busy = Boolean(op);
      const set = (k) => (e) => { setForm((old) => ({ ...old, [k]: e.target.value })); setTested(undefined); setValidation(''); };
      const dirty = form.name !== (channel?.name || '') || form.baseURL !== (channel?.baseURL || '') || Boolean(form.apiKey) || form.activate;
      // Changing the address of a saved channel needs a fresh token: the stored one is never sent to a new host.
      const addressChanged = Boolean(channel) && form.baseURL.trim().replace(/\/+$/, '') !== String(channel.baseURL || '').replace(/\/+$/, '');
      const check = (isTest) => {
        if (!isTest && !form.name.trim()) return t('nameRequired');
        try { const u = new URL(form.baseURL.trim()); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return t('addressRequired'); } catch { return t('addressRequired'); }
        if ((!channel || addressChanged) && !form.apiKey.trim()) return t('tokenRequired');
        return '';
      };
      const run = (kind, fn) => async () => {
        const problem = check(kind === 'test');
        if (problem) return setValidation(problem);
        setOp(kind);
        try { await a.run(fn); } finally { setOp(''); }
      };
      const test = run('test', async () => setTested(await store.mutate('channel/test', { id: channel?.id, ...form, baseURL: form.baseURL.trim() }, { update: false })));
      const save = run('save', async () => { await store.mutate('channel/save', { id: channel?.id, revision, ...form, baseURL: form.baseURL.trim() }); onSaved(); });
      const discard = () => { if (!dirty || window.confirm(t('changeDiscard'))) onClose(); };
      const sectionTitle = (n, key) => h('div', { className: 'nas-editor-section-title' }, h('span', null, n), t(key));
      const count = (label, value) => h('div', { className: 'nas-test-stat' }, h('strong', null, value ?? 0), h('span', null, t(label)));
      return h(Modal, { title: t(channel ? 'editChannel' : 'newChannel'), hint: t(channel ? 'editHint' : 'newHint'), onClose, busy, dirty, className: 'nas-model-editor nas-channel-editor',
        footer: h(React.Fragment, null,
          h(Button, { icon: op === 'test' ? 'refresh' : 'stopwatch', 'aria-busy': op === 'test', onClick: test, disabled: busy }, t(op === 'test' ? 'testing' : 'testConnection')),
          h('div', { className: 'nas-actions' },
            dirty && h('span', { className: 'nas-editor-dirty', title: t('unsaved'), 'aria-label': t('unsaved') }),
            h(Button, { onClick: discard, disabled: busy }, t('cancel')),
            h(Button, { type: 'submit', form: `${prefix}-form`, tone: 'primary', disabled: busy || (channel && !dirty) }, t(op === 'save' ? 'saving' : 'save')))),
      },
      h('form', { id: `${prefix}-form`, onSubmit: (e) => { e.preventDefault(); save(); } },
        channel && h('div', { className: 'nas-editor-identity' },
          h('div', { className: 'nas-channel-mark' }, h(Icon, { name: 'gateway', size: 17 })),
          h('div', { style: { minWidth: 0, flex: 1 } }, h('div', { className: 'nas-sub' }, channel.name), h('code', null, channel.baseURL)),
          h(Badge, { tone: channel.active ? 'active' : '' }, channel.active && h(Icon, { name: 'check', size: 11 }), t(channel.active ? 'active' : 'inactive'))),
        h('section', { className: 'nas-editor-section first' }, sectionTitle('01', 'connectionSection'),
          h(Field, { label: t('channelName'), htmlFor: `${prefix}-name` }, h('input', { id: `${prefix}-name`, value: form.name, onChange: set('name'), placeholder: t('channelNamePlaceholder'), maxLength: 80, autoFocus: true, 'data-autofocus': true, disabled: busy })),
          h(Field, { label: t('address'), hint: t('addressHint'), htmlFor: `${prefix}-url` },
            h('div', { className: 'nas-input-icon' }, h(Icon, { name: 'gateway', size: 14 }),
              h('input', { id: `${prefix}-url`, type: 'url', value: form.baseURL, onChange: set('baseURL'), placeholder: 'https://api.example.com', spellCheck: false, autoComplete: 'off', disabled: busy })))),
        h('section', { className: 'nas-editor-section' }, sectionTitle('02', 'credentialSection'),
          h(Field, { label: t('apiKey'), hint: addressChanged ? t('keyRequiredForAddress') : t('keyHint'), htmlFor: `${prefix}-key` },
            h('div', { className: 'nas-input-icon' }, h(Icon, { name: 'key', size: 14 }),
              h('input', { id: `${prefix}-key`, type: showKey ? 'text' : 'password', autoComplete: 'new-password', spellCheck: false, value: form.apiKey, onChange: set('apiKey'), placeholder: t(channel && !addressChanged ? 'keyUnchanged' : 'keyPlaceholder'), disabled: busy }),
              form.apiKey && h('button', { type: 'button', className: 'nas-input-toggle', onClick: () => setShowKey(!showKey), 'aria-pressed': showKey, title: t(showKey ? 'hideKey' : 'showKey') }, t(showKey ? 'hideKey' : 'showKey')))),
          channel && h('div', { className: 'nas-key-state' }, h('span', { className: `nas-dot ${channel.keyConfigured ? 'ok' : 'warn'}` }), t(form.apiKey ? 'keyWillReplace' : channel.keyConfigured ? 'credentialSet' : 'credentialMissing'))),
        !channel?.active && h('label', { className: 'nas-activate-row' },
          h('div', null, h('strong', null, t('activateOnSave')), h('div', { className: 'nas-sub' }, t('activateHint'))),
          h('input', { type: 'checkbox', role: 'switch', checked: form.activate, onChange: (e) => setForm({ ...form, activate: e.target.checked }), disabled: busy })),
        h(ErrorText, { text: validation || a.error }),
        tested ? h('div', { className: `nas-test-panel ${tested.ok ? 'ok' : 'bad'}`, role: 'status' },
          h('div', { className: 'nas-test-head' },
            h('span', { className: 'nas-test-badge' }, h(Icon, { name: tested.ok ? 'check' : 'alert', size: 13 }), t(tested.ok ? 'testPassed' : 'failed')),
            tested.ok && h('span', { className: 'num' }, `${(tested.latencyMs / 1000).toFixed(2)}s`),
            tested.ok && h('span', { className: 'nas-sub', style: { marginLeft: 'auto' } }, `${tested.systemName || 'New API'} ${tested.version || ''}`)),
          tested.ok
            ? h('div', { className: 'nas-test-stats' }, count('totalModels', tested.models?.total), count('chat', tested.models?.chat), count('image', tested.models?.image), count('video', tested.models?.video))
            : h('div', { className: 'nas-test-error' }, tested.error))
          : h('div', { className: 'nas-note', style: { marginTop: 14 } }, h(Icon, { name: 'info', size: 13 }), t('testHint'))));
    }
    function ModelEditor({ model, channel, revision, siblings = [], onClose, onSaved }) {
      const t = useT(); const id = useId(); const a = useAction();
      const initial = model.override || {};
      const automaticInput = model.automaticInput ?? model.input ?? ['text'];
      const [form, setForm] = useState({
        name: initial.name || '', upstreamModel: initial.upstreamModel || '',
        contextWindow: initial.contextWindow == null ? '' : String(initial.contextWindow),
        maxTokens: initial.maxTokens == null ? '' : String(initial.maxTokens),
        kind: initial.kind || '', protocol: initial.protocol || '',
        inputMode: Array.isArray(initial.input) ? 'custom' : 'auto',
        input: [...(initial.input ?? automaticInput)],
        reasoningMode: initial.reasoning == null ? 'auto' : initial.reasoning ? 'on' : 'off',
        hidden: Boolean(initial.hidden),
      });
      const original = useRef(JSON.stringify(form)); const dirty = original.current !== JSON.stringify(form);
      const [invalid, setInvalid] = useState(''); const [resetting, setResetting] = useState(false);
      const target = form.upstreamModel.trim() || model.id;
      const mappingChanged = target !== (initial.upstreamModel || model.id);
      const changed = (k) => (e) => { setInvalid(''); setResetting(false); setForm({ ...form, [k]: e.target.value }); };
      const discard = () => { if (!dirty || window.confirm(t('changeDiscard'))) onClose(); };
      const save = () => {
        if (a.pending) return;
        for (const k of ['contextWindow', 'maxTokens']) if (form[k] && (!/^\d+$/.test(form[k]) || Number(form[k]) < 1 || !Number.isSafeInteger(Number(form[k])))) return setInvalid(t('positiveInteger'));
        if (form.upstreamModel.trim() && (/\s|[\u0000-\u001f\u007f-\u009f]/u.test(form.upstreamModel.trim()) || form.upstreamModel.trim().length > 500)) return setInvalid(t('invalidMapping'));
        const override = { ...initial };
        for (const k of ['name', 'upstreamModel', 'kind', 'protocol', 'contextWindow', 'maxTokens']) {
          const value = form[k].trim();
          override[k] = value ? (['contextWindow', 'maxTokens'].includes(k) ? Number(value) : value) : null;
        }
        override.input = form.inputMode === 'auto' ? null : form.input;
        override.reasoning = form.reasoningMode === 'auto' ? null : form.reasoningMode === 'on';
        override.hidden = form.hidden ? true : null;
        return a.run(async () => { await store.mutate('model/override', { revision, channelId: channel.id, modelId: model.id, override }); onSaved(false); });
      };
      const reset = () => a.run(async () => { await store.mutate('model/override', { revision, channelId: channel.id, modelId: model.id, override: null, reset: true }); onSaved(true); });
      const fields = (k, label, automatic) => h(Field, { key: k, label: t(label), hint: `${t('auto')}: ${tokens(automatic)} tokens`, htmlFor: `${id}-${k}` },
        h('div', { className: 'nas-number-field' }, h('input', { id: `${id}-${k}`, inputMode: 'numeric', type: 'text', value: form[k], onChange: changed(k), placeholder: automatic ? String(automatic) : '—', disabled: a.pending }), h('span', null, 'tokens')));
      const sectionTitle = (n, key) => h('div', { className: 'nas-editor-section-title' }, h('span', null, n), t(key));
      const choices = [['text', 'text', 'document'], ['image', 'inputImage', 'image'], ['pdf', 'pdf', 'document'], ['audio', 'inputAudio', 'audio'], ['video', 'inputVideo', 'video']];
      // Mapping suggestions come from the edited channel's own list, not the active channel's.
      const suggestions = siblings.filter((value) => value !== model.id);
      return h(Modal, { title: t('modelEdit'), hint: channel.name, onClose, busy: a.pending, dirty, className: 'nas-model-editor',
        footer: h(React.Fragment, null,
          h(Button, { tone: resetting ? 'danger' : 'ghost', disabled: a.pending, onClick: () => resetting ? reset() : setResetting(true), title: t('resetDescription') }, t(resetting ? 'resetAsk' : 'reset')),
          h('div', { className: 'nas-actions' }, dirty && h('span', { className: 'nas-editor-dirty', title: t('unsaved'), 'aria-label': t('unsaved') }), h(Button, { onClick: discard, disabled: a.pending }, t('cancel')), h(Button, { type: 'submit', form: `${id}-form`, tone: 'primary', disabled: a.pending || !dirty }, t(a.pending ? 'saving' : 'modelSave')))),
      },
      h('form', { id: `${id}-form`, onSubmit: (e) => { e.preventDefault(); save(); } },
        h('div', { className: 'nas-editor-identity' }, h(VendorIcon, { vendor: model.vendor, modelId: model.id }),
          h('div', null, h('div', { className: 'nas-sub' }, t('localModelId')), h('code', null, model.id))),
        h('section', { className: 'nas-editor-section' }, sectionTitle('01', 'namingSection'),
          h(Field, { label: t('displayName'), hint: t('displayNameHint'), htmlFor: `${id}-name` }, h('input', { id: `${id}-name`, value: form.name, onChange: changed('name'), placeholder: model.id, maxLength: 500, autoFocus: true, disabled: a.pending })),
          h(Field, { label: t('upstreamModel'), hint: t('upstreamHint'), htmlFor: `${id}-upstream` }, h('input', { id: `${id}-upstream`, value: form.upstreamModel, onChange: changed('upstreamModel'), placeholder: model.id, list: `${id}-suggestions`, autoComplete: 'off', spellCheck: false, maxLength: 500, disabled: a.pending }),
            h('datalist', { id: `${id}-suggestions` }, suggestions.map((value) => h('option', { key: value, value })))),
          h('div', { className: 'nas-mapping-preview', 'aria-live': 'polite' }, h('span', { className: 'nas-sub' }, t('mappingPreview')),
            h('div', { className: 'nas-mapping-path' }, h('code', { title: model.id }, model.id), h(Icon, { name: 'arrow', size: 14 }), h('code', { title: target, className: target !== model.id ? 'mapped' : '' }, target))),
          mappingChanged && h('div', { className: 'nas-note' }, h(Icon, { name: 'info', size: 12 }), t('mappingMetadataHint'))),
        h('section', { className: 'nas-editor-section' }, sectionTitle('02', 'capacitySection'),
          h('div', { className: 'nas-two' }, fields('contextWindow', 'context', model.automaticContextWindow ?? model.effectiveContextWindow), fields('maxTokens', 'maxOutput', model.automaticMaxTokens ?? model.effectiveMaxTokens)),
          h('div', { className: 'nas-editor-cap-head' }, h('span', null, t('inputModalities')),
            h('div', { className: 'nas-segment', role: 'group', 'aria-label': t('inputModalities') }, ['auto', 'custom'].map((mode) => h('button', { key: mode, type: 'button', 'aria-pressed': form.inputMode === mode, disabled: a.pending,
              onClick: () => setForm({ ...form, inputMode: mode, input: mode === 'custom' && form.inputMode === 'auto' ? [...automaticInput] : form.input }) }, t(mode === 'auto' ? 'automaticMode' : 'customMode'))))),
          h('div', { className: 'nas-modality-options', role: 'group', 'aria-label': t('inputModalities') }, choices.map(([value, label, icon]) => {
            const selected = (form.inputMode === 'auto' ? automaticInput : form.input).includes(value);
            return h('button', { key: value, type: 'button', role: 'checkbox', 'aria-checked': selected, disabled: a.pending || form.inputMode === 'auto', className: selected ? 'selected' : '',
              onClick: () => setForm({ ...form, input: selected ? form.input.filter((x) => x !== value) : [...form.input, value] }) }, h(Icon, { name: icon, size: 13 }), t(label), selected && h(Icon, { name: 'check', size: 11 }));
          })),
          h('div', { className: 'nas-note', style: { marginTop: 8, marginBottom: 16 } }, t('inputHint')),
          h(Field, { label: t('reasoning'), htmlFor: `${id}-reasoning` }, h('select', { id: `${id}-reasoning`, value: form.reasoningMode, onChange: changed('reasoningMode'), disabled: a.pending },
            h('option', { value: 'auto' }, `${t('followAuto')} · ${t((model.automaticReasoning ?? model.reasoning) ? 'enableReasoning' : 'disableReasoning')}`), h('option', { value: 'on' }, t('enableReasoning')), h('option', { value: 'off' }, t('disableReasoning'))))),
        h('details', { className: 'nas-editor-advanced' }, h('summary', null, t('advancedOptions')),
          h('div', { className: 'nas-two' },
            h(Field, { label: t('kind'), htmlFor: `${id}-kind` }, h('select', { id: `${id}-kind`, value: form.kind, onChange: changed('kind'), disabled: a.pending }, h('option', { value: '' }, t('auto')), ['chat', 'image', 'video', 'audio', 'embedding', 'other'].map((k) => h('option', { key: k, value: k }, t(k))))),
            h(Field, { label: t('protocolLabel'), htmlFor: `${id}-protocol` }, h('select', { id: `${id}-protocol`, value: form.protocol, onChange: changed('protocol'), disabled: a.pending }, h('option', { value: '' }, t('auto')), ['openai', 'openai-response', 'anthropic', 'gemini'].map((p) => h('option', { key: p, value: p }, p))))),
          h(Check, { checked: form.hidden, onChange: (value) => setForm({ ...form, hidden: value }), disabled: a.pending }, t('hideModel'))),
        resetting && h('div', { className: 'nas-editor-reset', role: 'status' }, h(Icon, { name: 'info', size: 14 }), t('resetDescription')),
        h(ErrorText, { text: invalid || a.error })));
    }
    /** One compact row per gateway: identity · quota · health · actions. Details live in tooltips. */
    function ChannelCard({ channel: ch, count, busy, onEdit, onActivate, onDelete }) {
      const t = useT(); const b = ch.balance; const q = quota(b);
      const [confirm, setConfirm] = useState(false);
      const [check, setCheck] = useState({ running: false, result: undefined });
      // Read-only and free: lists the gateway catalog with the saved token. Not routed through the
      // store's single write lock, so several rows can be tested at once without blocking edits.
      const runTest = async () => {
        setCheck({ running: true, result: undefined });
        let result;
        try { result = await api('channel/test', { id: ch.id }); }
        catch (e) { result = { ok: false, error: e.message }; }
        setCheck({ running: false, result });
        void store.load();
      };
      const r = check.result;
      const testTitle = r ? (r.ok
        ? [`${t('testPassed')} · ${(r.latencyMs / 1000).toFixed(2)}s`, `${r.systemName || 'New API'} ${r.version || ''}`.trim(), `${t('totalModels')} ${r.models?.total ?? 0} · ${t('chat')} ${r.models?.chat ?? 0} · ${t('image')} ${r.models?.image ?? 0} · ${t('video')} ${r.models?.video ?? 0}`].join('\n')
        : `${t('failed')}\n${r.error || ''}`) : '';
      const failed = b?.status === 'error';
      // Health = can this gateway be used right now. A fresh manual test outranks the background balance check.
      const health = check.running ? { tone: 'run', icon: 'refresh', tip: t('testing') }
        : r ? (r.ok ? { tone: 'ok', icon: 'heartPulse', tip: testTitle, text: `${(r.latencyMs / 1000).toFixed(2)}s` } : { tone: 'bad', icon: 'heartCrack', tip: testTitle, text: t('testFail') })
        : !ch.keyConfigured ? { tone: 'warn', icon: 'heart', tip: t('healthNoKey') }
        : failed ? { tone: 'bad', icon: 'heartCrack', tip: [t('healthBad'), b?.message].filter(Boolean).join('\n') }
        : b?.status === 'stale' ? { tone: 'warn', icon: 'heart', tip: t('healthStale') }
        : b?.status === 'ok' ? { tone: 'ok', icon: 'heartPulse', tip: t('healthOk') }
        : { tone: 'idle', icon: 'heart', tip: t('healthUnknown') };
      const quotaTip = [t(q.label), b?.token?.unlimited ? t('unlimited') : null, failed ? b?.message : null].filter(Boolean).join('\n');
      const label = `${ch.name}${ch.active ? ` · ${t('activeTip')}` : ''}`;
      return h('div', { className: `nas-ch-row ${ch.active ? 'is-active' : ''}`, role: 'listitem', 'aria-current': ch.active ? 'true' : undefined, 'aria-label': label },
        h('span', { className: 'nas-ch-mark', 'data-tip': t(ch.active ? 'activeTip' : 'inactiveTip'), 'data-tip-align': 'start' }, h(Icon, { name: ch.active ? 'check' : 'gateway', size: 15 })),
        h('div', { className: 'nas-ch-id' },
          h('strong', { className: 'nas-ch-name' }, ch.name),
          h('div', { className: 'nas-ch-url' }, ch.baseURL)),
        h('div', { className: `nas-ch-quota ${failed ? 'bad' : ''}`, 'data-tip': quotaTip },
          h('span', { className: 'nas-ch-amount' }, failed ? t('failed') : q.value),
          h('span', { className: 'nas-ch-quota-label' }, failed ? t('balanceUnavailable') : t(q.label))),
        h('span', { className: `nas-ch-health ${health.tone}`, 'data-tip': health.tip, role: 'img', 'aria-label': health.tip },
          h(Icon, { name: health.icon, size: 15, spin: check.running }), health.text && h('span', null, health.text)),
        confirm
          ? h('div', { className: 'nas-ch-actions confirm', role: 'group', 'aria-label': t('deleteHint') },
            h('span', { className: 'nas-sub', 'data-tip': t('deleteHint'), 'data-tip-align': 'end' }, `${t('confirmRemove')}?`),
            h(Button, { small: true, tone: 'danger', onClick: onDelete, disabled: busy }, t('remove')),
            h(Button, { small: true, tone: 'ghost', onClick: () => setConfirm(false) }, t('cancel')))
          : h('div', { className: 'nas-ch-actions' },
            ch.active
              ? h('span', { className: 'nas-ch-slot', 'aria-hidden': true })
              : h(Button, { small: true, className: 'nas-icon-btn', icon: 'power', tip: t('activateTip'), tipAlign: 'end', onClick: onActivate, disabled: busy }),
            h(Button, { small: true, className: 'nas-icon-btn', icon: check.running ? 'refresh' : 'gauge', 'aria-busy': check.running, tip: t('channelTestTip'), tipAlign: 'end', onClick: runTest, disabled: check.running || !ch.keyConfigured }),
            h(Button, { small: true, className: 'nas-icon-btn', icon: 'edit', tip: t('editChannelTip'), tipAlign: 'end', onClick: onEdit, disabled: busy }),
            h(Button, { small: true, className: 'nas-icon-btn', icon: 'trash', tip: count < 2 ? t('lastChannel') : t('removeChannelTip'), tipAlign: 'end', disabled: busy || count < 2, onClick: () => setConfirm(true) })));
    }
    // ------------------------------------------------------------ model tests
    // Results live in the Host (entries[].lastTest); this map only tracks
    // in-flight calls and fresh results until the next snapshot arrives.
    const tests = {
      running: new Map(), results: new Map(), listeners: new Set(),
      emit() { for (const fn of this.listeners) fn(); },
      key: (channelId, modelId) => `${channelId}\u0000${modelId}`,
      async run(channelId, modelId, confirmPaid = false) {
        const k = this.key(channelId, modelId);
        if (this.running.has(k)) return this.running.get(k);
        const p = api('model/test', { channelId, modelId, confirmPaid })
          .catch((e) => ({ ok: false, code: e.status === 429 ? 'RATE_LIMIT' : 'HTTP', error: e.message, testedAt: Date.now() }))
          .then((r) => { this.results.set(k, r); return r; })
          .finally(() => { this.running.delete(k); this.emit(); });
        this.running.set(k, p); this.emit();
        return p;
      },
    };
    function useTests() {
      const [, set] = useState(0);
      useEffect(() => { const fn = () => set((n) => n + 1); tests.listeners.add(fn); return () => tests.listeners.delete(fn); }, []);
      return tests;
    }
    function errorLabel(t, r) {
      if (!r) return '';
      const named = r.code && t(`code_${r.code}`) !== `code_${r.code}` ? t(`code_${r.code}`) : '';
      return [named, r.status ? `HTTP ${r.status}` : '', r.error].filter(Boolean).join(' · ');
    }
    function ms(v) { return v == null ? '—' : v >= 10000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`; }
    function ago(ts) {
      if (!ts) return '';
      const s = Math.max(0, (Date.now() - ts) / 1000);
      const zh = activeDict() === ZH;
      if (s < 60) return zh ? '刚刚' : 'just now';
      if (s < 3600) return zh ? `${Math.floor(s / 60)} 分钟前` : `${Math.floor(s / 60)} min ago`;
      if (s < 86400) return zh ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 3600)} h ago`;
      return new Date(ts).toLocaleDateString(zh ? 'zh-CN' : 'en-US');
    }
    function TestCell({ channelId, model }) {
      const t = useT(); useTests();
      const k = tests.key(channelId, model.id);
      if (tests.running.has(k)) return h('div', { className: 'nas-test-cell compact', role: 'status' }, h(Icon, { name: 'refresh', size: 11, spin: true }), t('testingModel'));
      const r = tests.results.get(k) ?? model.lastTest;
      if (!r) return h('div', { className: 'nas-test-cell compact', title: t('neverTested') }, t('neverTested'));
      const pending = r.phase === 'accepted';
      const label = pending ? t('pendingTest') : t(r.ok ? 'testOk' : 'testFail');
      const duration = Number.isFinite(r.latencyMs) && r.latencyMs >= 0 ? `${(r.latencyMs / 1000).toFixed(2)}s` : '—';
      const detail = [
        pending ? `${t('acceptedTest')} · ${t('checkGeneration')}` : !r.ok ? errorLabel(t, r) : null,
        `${t('total')} ${duration}`,
        r.firstByteMs != null ? `${t('firstByte')} ${(r.firstByteMs / 1000).toFixed(2)}s` : null,
        r.testedAt ? `${t('testedAt')} ${ago(r.testedAt)}` : null,
      ].filter(Boolean).join('\n');
      return h('div', { className: 'nas-test-cell compact', title: detail, 'aria-label': `${label} ${detail}` },
        h('span', { className: `nas-test-status ${pending ? 'pending' : r.ok ? 'ok' : 'bad'}` }, h('span', { className: 'nas-result-dot', 'aria-hidden': true }), label),
        h('span', { className: 'num' }, duration));
    }
    function PaidTestDialog({ channel, model, onClose }) {
      const t = useT(); const [result, setResult] = useState(); const [busy, setBusy] = useState(false);
      const go = async () => { setBusy(true); try { setResult(await tests.run(channel.id, model.id, true)); } finally { setBusy(false); } };
      const preview = result?.preview;
      return h(Modal, { title: result ? `${t('test')} · ${model.id}` : t('paidTitle'), hint: `${channel.name} / ${model.id}`, onClose, busy,
        footer: h('div', { className: 'nas-actions', style: { marginLeft: 'auto' } },
          h(Button, { onClick: onClose, disabled: busy }, t(result ? 'close' : 'cancel')),
          !result && h(Button, { tone: 'primary', icon: busy ? 'refresh' : 'bolt', 'aria-busy': busy, onClick: go, disabled: busy }, t(busy ? 'testingModel' : 'paidConfirm'))),
      },
      !result && h('div', { className: 'nas-mode' }, h(Icon, { name: 'alert', size: 14 }), t(model.kind === 'video' ? 'paidVideo' : 'paidImage')),
      result && (result.ok || result.phase === 'accepted'
        ? h('div', { className: `nas-test ${result.ok ? 'ok' : ''}`, role: 'status' }, h('strong', null, `${t(result.ok ? 'testOk' : 'acceptedTest')} · ${ms(result.latencyMs)}`),
          result.previewOmitted && h('small', null, t('previewOmitted')),
          preview?.type === 'image' && h('div', { className: 'nas-preview-test' }, h('img', { src: preview.src, alt: model.id })),
          preview?.type === 'video-task' && h('small', null, `${t('tasks')}: ${preview.taskId}`))
        : h('div', { className: 'nas-test bad', role: 'alert' }, errorLabel(t, result))));
    }
    function BatchTestDialog({ channel, models, onClose }) {
      const t = useT(); const [state, setState] = useState({ done: 0, ok: 0, fail: 0, running: false, finished: false });
      const stop = useRef(false);
      const start = async () => {
        stop.current = false; setState({ done: 0, ok: 0, fail: 0, running: true, finished: false });
        const queue = [...models]; let done = 0; let ok = 0; let fail = 0;
        const worker = async () => {
          while (queue.length && !stop.current) {
            const m = queue.shift();
            const r = await tests.run(channel.id, m.id);
            done++; if (r?.ok) ok++; else fail++;
            setState({ done, ok, fail, running: true, finished: false });
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        setState({ done, ok, fail, running: false, finished: true });
      };
      useEffect(() => () => { stop.current = true; }, []);
      const pct = models.length ? Math.round((state.done / models.length) * 100) : 0;
      return h(Modal, { title: t('batchTitle'), hint: channel.name, onClose: () => { stop.current = true; onClose(); },
        footer: h('div', { className: 'nas-actions', style: { marginLeft: 'auto' } },
          state.running ? h(Button, { icon: 'stop', onClick: () => { stop.current = true; } }, t('stopTest'))
            : h(Button, { onClick: onClose }, t(state.finished ? 'close' : 'cancel')),
          !state.running && !state.finished && h(Button, { tone: 'primary', icon: 'play', onClick: start, disabled: !models.length }, t('batchStart'))),
      },
      h('p', { className: 'nas-sub', style: { marginTop: 0 } }, models.length ? tf('batchHint', models.length) : t('batchNone')),
      (state.running || state.finished) && h(React.Fragment, null,
        h('div', { className: 'nas-progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': models.length, 'aria-valuenow': state.done }, h('i', { style: { width: `${pct}%` } })),
        h('div', { className: 'nas-sub', role: 'status' }, state.finished ? tf('batchDone', state.ok, state.fail) : tf('batchProgress', state.done, models.length))));
    }
    /**
     * Adds gateway models to one channel. A gateway can list hundreds of models,
     * so the dialog keeps its toolbar and action bar fixed and scrolls only the
     * results. Filtering never drops the current selection: the pick set is
     * keyed by id and survives every status/kind/search change.
     */
    function DiscoverDialog({ channel, revision, onClose, onDone }) {
      const t = useT(); const [data, setData] = useState(); const [error, setError] = useState('');
      const [picked, setPicked] = useState(() => new Set()); const a = useAction();
      const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [kind, setKind] = useState('all');
      const searchRef = useRef();
      // The catalog usually lands after the dialog mounts, so the field cannot rely on autofocus.
      useEffect(() => { if (data) searchRef.current?.focus(); }, [data]);
      useEffect(() => {
        let alive = true;
        api('models/discover', { channelId: channel.id }).then((d) => {
          if (!alive) return;
          setData(d);
          setPicked(new Set(d.models.filter((m) => m.status === 'new').map((m) => m.id)));
        }).catch((e) => alive && setError(e.message));
        return () => { alive = false; };
      }, [channel.id]);
      const toggle = (id) => setPicked((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
      const missing = data?.missing ?? [];
      // Models the gateway dropped stay in the same list, marked, so the user decides.
      // Their kind is unknown, so they sit outside the kind chips and only answer to the status chip.
      const rows = data ? [...data.models, ...missing.map((m) => ({ id: m.id, kind: 'missing', status: 'missing', custom: m.custom }))] : [];
      const byStatus = { all: rows.length, new: 0, enabled: 0, missing: 0 };
      const byKind = {};
      for (const m of rows) { byStatus[m.status] += 1; byKind[m.kind] = (byKind[m.kind] ?? 0) + 1; }
      // Every kind the gateway returns needs a chip, including audio and embedding;
      // a fixed list would silently hide those models from filtering.
      const kindOrder = ['chat', 'image', 'video', 'audio', 'embedding', 'other'];
      const byKindValues = [...kindOrder.filter((k) => byKind[k] > 0), ...Object.keys(byKind).filter((k) => !kindOrder.includes(k))];
      const query = search.trim().toLowerCase();
      const statusRank = { new: 0, enabled: 1, missing: 2 }; const kindRank = { chat: 0, image: 1, video: 2, audio: 3, embedding: 4, other: 5 };
      // Grouped view (no filter): one block per kind, new models first inside it. Filtered view:
      // new models first overall. Sorting by status first in the grouped view repeated kind headers.
      const grouped = kind === 'all' && status === 'all' && !query;
      const byKindRank = (x, y) => (kindRank[x.kind] ?? 9) - (kindRank[y.kind] ?? 9);
      const byStatusRank = (x, y) => statusRank[x.status] - statusRank[y.status];
      const shown = rows
        .filter((m) => (status === 'all' || m.status === status) && (kind === 'all' || m.kind === kind)
          && (!query || `${m.id} ${m.vendor ?? ''}`.toLowerCase().includes(query)))
        .sort((x, y) => (grouped ? byKindRank(x, y) || byStatusRank(x, y) : byStatusRank(x, y) || byKindRank(x, y)) || x.id.localeCompare(y.id));
      const selectable = shown.filter((m) => m.status === 'new' && !picked.has(m.id));
      const droppable = missing.filter((m) => !m.custom);
      const filtered = Boolean(query) || status !== 'all' || kind !== 'all';
      const reset = () => { setSearch(''); setStatus('all'); setKind('all'); };
      const add = () => a.run(async () => { await store.mutate('models/set', { revision, channelId: channel.id, add: [...picked] }); onDone(tf('addedModels', picked.size)); });
      const dropMissing = () => a.run(async () => { await store.mutate('models/set', { revision, channelId: channel.id, remove: droppable.map((m) => m.id) }); onDone(tf('removedMissing', droppable.length)); });
      const statusLabel = { all: 'all', new: 'statusNew', enabled: 'statusEnabled', missing: 'statusMissing' };
      const chips = (values, counts, current, onPick, label) => h('div', { className: 'nas-filter', role: 'group', 'aria-label': label },
        values.map((k) => h('button', { key: k, type: 'button', 'aria-pressed': current === k, onClick: () => onPick(k) },
          t(statusLabel[k] ?? k), ' ', h('span', { className: 'nas-count' }, k === 'all' ? rows.length : counts[k] ?? 0))));
      return h(Modal, { title: t('discoverTitle'), hint: `${channel.name} · ${t('discoverHint')}`, onClose, busy: a.pending, className: 'nas-discover',
        footer: h(React.Fragment, null,
          h('div', { className: 'nas-actions' },
            droppable.length > 0 && h(Button, { small: true, tone: 'danger', onClick: dropMissing, disabled: a.pending }, `${t('removeMissing')} (${droppable.length})`),
            selectable.length > 0 && h(Button, { small: true, tone: 'ghost', onClick: () => setPicked((old) => new Set([...old, ...selectable.map((m) => m.id)])), disabled: a.pending }, `${t('selectShown')} (${selectable.length})`),
            picked.size > 0 && h(Button, { small: true, tone: 'ghost', onClick: () => setPicked(new Set()), disabled: a.pending }, t('clearSelection'))),
          h('div', { className: 'nas-actions' },
            h(Button, { onClick: onClose, disabled: a.pending }, t('cancel')),
            h(Button, { tone: 'primary', icon: 'plus', onClick: add, disabled: a.pending || !picked.size }, `${t('addSelected')}${picked.size ? ` (${picked.size})` : ''}`))),
      },
      !data && !error && h(React.Fragment, null,
        h('div', { className: 'nas-sub', role: 'status' }, h(Icon, { name: 'refresh', size: 13, spin: true }), ` ${t('discovering')}`),
        h('div', { className: 'nas-discover-scroll', 'aria-hidden': true },
          h('div', { className: 'nas-skeleton' }, [93, 72, 86, 64, 79].map((w, i) => h('i', { key: i, style: { width: `${w}%` } }))))),
      error && h(ErrorText, { text: `${t('discoverFailed')}: ${error}` }),
      data && h(React.Fragment, null,
        h('div', { className: 'nas-discover-tools' },
          h('label', { className: 'nas-search' }, h(Icon, { name: 'search', size: 14 }),
            h('input', { ref: searchRef, value: search, 'data-autofocus': true, spellCheck: false, placeholder: t('discoverSearch'), 'aria-label': t('discoverSearch'), onChange: (e) => setSearch(e.target.value) })),
          h('div', { className: 'nas-discover-bar' },
            chips(['all', 'new', 'enabled', 'missing'].filter((k) => k === 'all' || byStatus[k] > 0), byStatus, status, setStatus, t('discoverStatus')),
            h('span', { className: 'nas-sub', role: 'status', 'aria-live': 'polite' }, tf('discoverShown', shown.length, rows.length, picked.size))),
          byKindValues.length > 1 && h('div', { className: 'nas-discover-bar' },
            chips(byKindValues, byKind, kind, setKind, t('discoverKind')))),
        rows.length > 0 && !byStatus.new && h('div', { className: 'nas-mode' }, h(Icon, { name: 'check', size: 14 }), t('nothingNew')),
        h(ErrorText, { text: a.error }),
        h('div', { className: 'nas-discover-scroll' },
          !shown.length
            ? h('div', { className: 'nas-discover-blank', role: 'status' },
              h(Icon, { name: rows.length ? 'search' : 'grid', size: 20 }),
              h('span', null, t(rows.length ? 'discoverNoMatch' : 'nothingNew')),
              filtered && h(Button, { small: true, tone: 'ghost', onClick: reset }, t('resetFilter')))
            : h('div', { className: 'nas-dlist' }, shown.map((m, index) => {
              const enabled = m.status === 'enabled'; const gone = m.status === 'missing'; const on = enabled || picked.has(m.id);
              const kindLabel = gone ? t('missingBadge') : t(m.kind);
              // A kind group header keeps a long gateway list readable.
              const header = (grouped && (index === 0 || shown[index - 1].kind !== m.kind))
                ? h('div', { className: 'nas-dgroup', key: `g-${m.kind}` }, h('span', null, t(m.kind === 'missing' ? 'statusMissing' : m.kind)), h('span', { className: 'nas-count' }, byKind[m.kind] ?? 0))
                : null;
              const badges = gone
                ? h(Badge, { tone: m.custom ? '' : 'warn' }, t(m.custom ? 'customBadge' : 'missingBadge'))
                : enabled ? h(Badge, null, t('statusEnabled')) : h(Badge, { tone: on ? 'good' : '' }, t('statusNew'));
              return h(React.Fragment, { key: m.id },
                header,
                h('label', { className: `nas-drow ${on && !enabled ? 'on' : ''} ${enabled || gone ? 'locked' : ''}` },
                  h('input', { type: 'checkbox', checked: on, disabled: enabled || gone || a.pending, onChange: () => toggle(m.id) }),
                  gone ? h('span', { className: 'nas-drow-mark warn' }, h(Icon, { name: 'alert', size: 13 })) : h(VendorIcon, { vendor: m.vendor, modelId: m.id, size: 16 }),
                  h('div', { className: 'nas-drow-main' },
                    h('div', { className: 'nas-drow-id' }, h('span', null, m.id)),
                    h('div', { className: 'nas-drow-meta' },
                      !gone && m.vendor && h('span', null, m.vendor),
                      !gone && h('span', { className: 'nas-drow-kind' }, kindLabel),
                      !gone && m.kind === 'chat' && m.contextWindow && h('span', { className: 'nas-drow-num' }, tokens(m.contextWindow)),
                      !gone && (m.input || []).some((i) => i !== 'text') && h('span', { className: 'nas-cap-icons' },
                        (m.input || []).filter((i) => i !== 'text').map((i) => h('span', { key: i }, h(Icon, { name: i === 'pdf' ? 'document' : i, size: 11 })))),
                      !gone && m.reasoning && h('span', { className: 'nas-cap-icons' }, h('span', null, h(Icon, { name: 'bolt', size: 11 }))))),
                  badges));
            })))));
    }
    function RemoveDialog({ channel, model, revision, onClose, onDone }) {
      const t = useT(); const [keep, setKeep] = useState(true); const a = useAction();
      const hasOverride = model.override && Object.keys(model.override).some((k) => k !== 'custom');
      const go = () => a.run(async () => {
        await store.mutate('models/set', { revision, channelId: channel.id, remove: [model.id], clearOverrides: !keep || !hasOverride });
        onDone(model, keep && hasOverride ? null : model.override);
      });
      return h(Modal, { title: t('removeTitle'), hint: `${channel.name} / ${model.id}`, onClose, busy: a.pending,
        footer: h('div', { className: 'nas-actions', style: { marginLeft: 'auto' } },
          h(Button, { onClick: onClose, disabled: a.pending }, t('cancel')),
          h(Button, { tone: 'danger', icon: 'trash', onClick: go, disabled: a.pending }, t('removeConfirm'))),
      },
      h('p', { className: 'nas-sub', style: { marginTop: 0 } }, t('removeHint')),
      hasOverride && h(Check, { checked: keep, onChange: setKeep, disabled: a.pending }, t('keepParams')),
      h(ErrorText, { text: a.error }));
    }
    function ManualAddDialog({ channel, revision, existing, onClose, onDone }) {
      const t = useT(); const id = useId(); const a = useAction();
      const [form, setForm] = useState({ modelId: '', kind: 'chat' }); const [invalid, setInvalid] = useState('');
      const go = () => {
        const modelId = form.modelId.trim();
        if (!modelId) return setInvalid(t('modelIdRequired'));
        if (existing.has(modelId)) return setInvalid(t('modelExists'));
        return a.run(async () => {
          await store.mutate('models/set', { revision, channelId: channel.id, add: [modelId], overrides: { [modelId]: { custom: true, kind: form.kind } } });
          onDone(tf('addedModels', 1));
        });
      };
      return h(Modal, { title: t('manualTitle'), hint: `${channel.name} · ${t('manualHint')}`, onClose, busy: a.pending, dirty: Boolean(form.modelId),
        footer: h('div', { className: 'nas-actions', style: { marginLeft: 'auto' } },
          h(Button, { onClick: onClose, disabled: a.pending }, t('cancel')),
          h(Button, { tone: 'primary', icon: 'plus', onClick: go, disabled: a.pending }, t('manualAdd'))),
      },
      h('div', { className: 'nas-two' },
        h(Field, { label: t('modelId'), htmlFor: `${id}-m` }, h('input', { id: `${id}-m`, value: form.modelId, autoFocus: true, spellCheck: false, 'data-autofocus': true, maxLength: 500, onChange: (e) => { setInvalid(''); setForm({ ...form, modelId: e.target.value }); }, onKeyDown: (e) => { if (e.key === 'Enter') go(); } })),
        h(Field, { label: t('kind'), htmlFor: `${id}-k` }, h('select', { id: `${id}-k`, value: form.kind, onChange: (e) => setForm({ ...form, kind: e.target.value }) }, ['chat', 'image', 'video', 'other'].map((k) => h('option', { key: k, value: k }, t(k)))))),
      h(ErrorText, { text: invalid || a.error }));
    }
    /**
     * Model list of one channel. The active channel's list rides on the shared
     * snapshot; any other channel is read on demand, so every gateway's list is
     * viewed and edited on its own.
     */
    function useChannelModels(state, channelId) {
      const isActive = channelId === state.activeChannel;
      const [other, setOther] = useState({ id: null, data: null, error: '', loading: false });
      // Re-read when the selection or the saved configuration (revision) changes.
      useEffect(() => {
        if (isActive) return undefined;
        let alive = true;
        setOther((o) => ({ id: channelId, data: o.id === channelId ? o.data : null, error: '', loading: true }));
        api('models/list', { channelId })
          .then((data) => { if (alive) setOther({ id: channelId, data, error: '', loading: false }); })
          .catch((e) => { if (alive) setOther({ id: channelId, data: null, error: e.message, loading: false }); });
        return () => { alive = false; };
      }, [channelId, isActive, state.revision]);
      if (isActive) return { models: state.models, loading: false, error: '' };
      return { models: other.id === channelId ? other.data : null, loading: other.loading, error: other.id === channelId ? other.error : '' };
    }
    function ModelsPanel({ state, channel, onEdit, notify }) {
      const t = useT(); useTests();
      const [search, setSearch] = useState(''); const [kind, setKind] = useState('all');
      const [dialog, setDialogState] = useState(); const [undo, setUndo] = useState(); const a = useAction();
      const setDialog = (value) => setDialogState(value ? { ...value, channel: structuredClone(channel), revision: state.revision } : undefined);
      const view = useChannelModels(state, channel.id);
      const models = view.models?.entries || [];
      const shown = models.filter((m) => (kind === 'all' || m.kind === kind) && `${m.id} ${m.name} ${m.vendor || ''}`.toLowerCase().includes(search.toLowerCase()));
      const kinds = ['all', ...new Set(models.map((m) => m.kind))];
      const testable = shown.filter((m) => m.kind === 'chat' && m.availability !== 'missing');
      useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(undefined), 8000); return () => clearTimeout(timer); }, [undo]);
      const close = (message) => { setDialog(undefined); if (message) notify(message); };
      const test = (m) => {
        if (m.kind === 'chat') return void tests.run(channel.id, m.id);
        if (m.kind === 'image' || m.kind === 'video') return setDialog({ type: 'paid', model: m });
        return undefined;
      };
      const restore = () => a.run(async () => {
        const u = undo;
        await store.mutate('models/set', { revision: store.state.revision, channelId: u.channelId, add: [u.model.id], ...(u.override ? { overrides: { [u.model.id]: u.override } } : {}) });
        setUndo(undefined);
        notify(t('undone'));
      });
      const listMode = view.models?.listMode === 'list';
      if (!view.models) {
        return view.error
          ? h(Empty, { icon: 'grid', title: t('modelsLoadFailed'), detail: view.error })
          : h('div', { className: 'nas-sub', role: 'status', style: { padding: '28px 4px' } }, h(Icon, { name: 'refresh', size: 13, spin: true }), ` ${t('loadingModels')}`);
      }
      return h(React.Fragment, null,
        h('div', { className: 'nas-toolbar' },
          h('label', { className: 'nas-search' }, h(Icon, { name: 'search', size: 14 }), h('input', { value: search, onChange: (e) => setSearch(e.target.value), placeholder: t('filter'), 'aria-label': t('filter') })),
          h('div', { className: 'nas-actions' },
            h(Button, { small: true, icon: 'download', onClick: () => setDialog({ type: 'discover' }), disabled: store.busy }, t('fetchModels')),
            h(Button, { small: true, icon: 'bolt', onClick: () => setDialog({ type: 'batch', models: testable }), disabled: store.busy }, t('batchTest')),
            h(Button, { small: true, icon: 'plus', tone: 'ghost', onClick: () => setDialog({ type: 'manual' }), disabled: store.busy }, t('addManual')))),
        h('div', { className: 'nas-toolbar', style: { marginTop: -4 } },
          h('div', { className: 'nas-filter', role: 'group', 'aria-label': t('kind') }, kinds.map((k) => h('button', { key: k, type: 'button', 'aria-pressed': kind === k, onClick: () => setKind(k) }, t(k), ' ', h('span', { className: 'nas-count' }, k === 'all' ? models.length : models.filter((m) => m.kind === k).length))))),
        h('div', { className: 'nas-mode' }, h(Icon, { name: 'info', size: 13 }), t(listMode ? 'listModeHint' : 'autoModeHint')),
        h(ErrorText, { text: a.error }),
        !shown.length ? h(Empty, { title: t(models.length ? 'modelEmpty' : 'noModels'), action: !models.length ? h(Button, { icon: 'download', onClick: () => setDialog({ type: 'discover' }) }, t('fetchModels')) : null }) : h('div', { className: 'nas-models' },
          h('div', { className: 'nas-model-head v2' }, h('span', null, `${t('model')} · ${shown.length}`), h('span', null, t('capabilities')), h('span', null, t('test')), h('span')),
          shown.map((m) => {
            const running = tests.running.has(tests.key(channel.id, m.id));
            const canTest = ['chat', 'image', 'video'].includes(m.kind);
            const modelTestTip = t(m.kind === 'chat' ? 'modelTestChatTip' : 'modelTestPaidTip');
            return h('div', { key: m.id, className: `nas-model-row v2 ${m.hidden || m.availability === 'missing' ? 'nas-hide' : ''}` },
              h('div', { className: 'nas-model-identity' },
                h(VendorIcon, { vendor: m.vendor, modelId: m.id }),
                h('span', { className: 'nas-model-name', 'data-tip': [m.name || m.id, m.id, t(m.kind), m.hidden ? t('hidden') : null, m.source?.overridden?.length ? t('overridden') : null].filter(Boolean).join('\n') }, m.name || m.id),
                m.upstreamModel && m.upstreamModel !== m.id && h('span', { style: { display: 'inline-flex', color: 'var(--nas-sub)' }, 'data-tip': `${t('upstreamModel')}: ${m.upstreamModel}`, role: 'img', 'aria-label': `${t('upstreamModel')}: ${m.upstreamModel}` }, h(Icon, { name: 'arrow', size: 12 })),
                m.availability === 'missing' && h('span', { className: 'nas-status-mark', 'data-tip': t('missingBadge'), role: 'img', 'aria-label': t('missingBadge') }, h(Icon, { name: 'alert', size: 13 }))),
              h('div', { className: 'nas-model-cap compact', 'data-tip-align': 'start', 'data-tip': [
                m.kind === 'chat' ? `${t('context')}: ${m.effectiveContextWindow} / ${t('maxOutput')}: ${m.effectiveMaxTokens}` : t(m.kind),
                `${t('source')}: ${m.source?.modelsDev?.provider || t('defaults')} · ${t(m.source?.modelsDev ? m.source.modelsDev.match === 'prefix' ? 'originPrefix' : 'originExact' : 'originNone')}`,
                m.source?.overridden?.length ? `${t('overridden')}: ${m.source.overridden.join(', ')}` : null,
              ].filter(Boolean).join('\n') },
                m.kind === 'chat' ? h('span', { className: 'nas-cap-numbers' }, tokens(m.effectiveContextWindow), h('span', { className: 'nas-cap-divider' }, ' / '), tokens(m.effectiveMaxTokens)) : h('span', null, t(m.kind)),
                h('span', { className: 'nas-cap-icons' },
                  (m.input || []).filter((i) => i !== 'text').map((i) => h('span', { key: i, 'data-tip': `${t('inputModalities')}: ${t(i === 'image' ? 'inputImage' : i === 'video' ? 'inputVideo' : i === 'audio' ? 'inputAudio' : i)}`, role: 'img', 'aria-label': i }, h(Icon, { name: i === 'pdf' ? 'document' : i, size: 12 }))),
                  m.reasoning && h('span', { 'data-tip': t('reasoning'), role: 'img', 'aria-label': t('reasoning') }, h(Icon, { name: 'bolt', size: 12 })))),
              h(TestCell, { channelId: channel.id, model: m }),
              h('div', { className: 'nas-row-actions' },
                h(Button, { small: true, className: 'nas-icon-btn', icon: running ? 'refresh' : 'gauge', 'aria-busy': running, tip: canTest ? modelTestTip : t('unsupportedTest'), tipAlign: 'end', disabled: running || !canTest, onClick: () => test(m) }),
                h(Button, { small: true, className: 'nas-icon-btn', icon: 'edit', tip: t('modelEdit'), tipAlign: 'end', onClick: () => onEdit(m, models.map((x) => x.id)) }),
                h(Button, { small: true, className: 'nas-icon-btn', icon: 'trash', tip: t('removeModel'), tipAlign: 'end', disabled: store.busy, onClick: () => setDialog({ type: 'remove', model: m }) })));
          })),
        undo && h('div', { className: 'nas-toast', role: 'status' }, h('span', null, tf('modelRemoved', undo.model.id)), h(Button, { small: true, onClick: restore, disabled: a.pending }, t('undo'))),
        dialog?.type === 'discover' && h(DiscoverDialog, { channel: dialog.channel, revision: dialog.revision, onClose: () => close(), onDone: close }),
        dialog?.type === 'batch' && h(BatchTestDialog, { channel: dialog.channel, models: dialog.models, onClose: () => close() }),
        dialog?.type === 'paid' && h(PaidTestDialog, { channel: dialog.channel, model: dialog.model, onClose: () => close() }),
        dialog?.type === 'manual' && h(ManualAddDialog, { channel: dialog.channel, revision: dialog.revision, existing: new Set(models.map((m) => m.id)), onClose: () => close(), onDone: close }),
        dialog?.type === 'remove' && h(RemoveDialog, { channel: dialog.channel, model: dialog.model, revision: dialog.revision,
          onClose: () => close(),
          onDone: (model, override) => { setDialog(undefined); setUndo({ channelId: dialog.channel.id, model, override: override && Object.keys(override).length ? override : null }); } }));
    }
    function Gallery({ media }) {
      const t = useT(); const items = (media?.history || []).filter((i) => i.images?.length || i.file);
      return h(React.Fragment, null,
        Boolean(media?.tasks?.length) && h('div', { style: { marginBottom: 18 } }, h('strong', { style: { fontSize: 13, fontWeight: 550 } }, t('tasks')), media.tasks.map((task) => h('div', { key: task.taskId, className: 'nas-task' },
          h('div', null, h('div', null, task.model), h('div', { className: 'nas-sub' }, task.taskId), task.error && h('div', { className: 'nas-field-error' }, task.error)),
          h(Badge, { tone: task.status === 'completed' ? 'good' : task.status === 'failed' ? 'error' : 'active' }, t(task.status === 'failed' ? 'task_failed' : task.status), task.progress != null ? ` ${task.progress}%` : '')))),
        items.length ? h('div', { className: 'nas-gallery' }, items.flatMap((item) => [
          ...(item.images || []).map((img) => h('figure', { key: img.id }, h('a', { href: apiUrl(`media/image/${encodeURIComponent(img.id)}`), target: '_blank', rel: 'noreferrer' }, h('img', { src: apiUrl(`media/image/${encodeURIComponent(img.id)}`), alt: item.prompt, loading: 'lazy' })), h('figcaption', null, item.model))),
          ...(item.file ? [h('figure', { key: item.file.id }, h('video', { src: apiUrl(`media/video/${encodeURIComponent(item.file.id)}`), controls: true, preload: 'metadata' }), h('figcaption', null, item.model))] : []),
        ])) : h(Empty, { title: t('generationEmpty'), detail: t('generationHint'), icon: 'image' }));
    }
    function SettingsPage() {
      const t = useT(); const { state, error, busy } = useProvider(); const a = useAction();
      const [tab, setTab] = useState('channels'); const [editor, setEditor] = useState(); const [modelEditor, setModelEditor] = useState(); const [notice, setNotice] = useState('');
      const [modelChannelId, setModelChannelId] = useState(null);
      const notify = (key) => { setNotice(t(key)); setEditor(undefined); setModelEditor(undefined); };
      useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
      const sync = () => a.run(() => store.mutate('refresh', {}));
      const header = h('header', { className: 'nas-head' },
        h('div', null, h('div', { className: 'nas-eyebrow' }, h(Icon, { name: 'gateway', size: 12 }), 'NEW API / PROVIDER'), h('h2', null, t('title')), h('div', { className: 'nas-sub' }, t('subtitle'))),
        h('div', { className: 'nas-actions' }, h(Button, { icon: 'refresh', onClick: sync, disabled: busy, 'aria-busy': busy }, t(busy ? 'refreshing' : 'refresh')),
          h(Button, { icon: 'plus', tone: 'primary', onClick: () => setEditor({ channel: null, revision: state.revision }), disabled: busy || !state }, t('add'))));
      if (!state) return h('div', { className: 'nas nas-page' }, h(Styles), header, h(Empty, {
        icon: 'gateway',
        title: error ? t('loadFailed') : t('loading'),
        detail: error ? `${error}\n${t('loadFailedHint')}` : null,
        action: error ? h(Button, { icon: 'refresh', onClick: () => store.load() }, t('retry')) : null,
      }));
      const channels = state.channels || []; const active = channels.find((c) => c.id === state.activeChannel) || channels[0];
      const b = active?.balance || state.balance; const q = quota(b); const entries = state.models?.entries || [];
      // Which channel the models tab shows. Defaults to the active one; falls back if that channel is removed.
      const modelChannel = channels.find((c) => c.id === modelChannelId) || active;
      const count = (kind) => entries.filter((e) => e.kind === kind).length;
      const operate = (path, ch, key) => a.run(async () => { await store.mutate(path, { id: ch.id, revision: state.revision }); notify(key); });
      return h('div', { className: 'nas nas-page', 'data-newapi-provider-version': '0.8.2' }, h(Styles), header,
        notice && h('div', { className: 'nas-feedback', role: 'status' }, h(Icon, { name: 'check', size: 14 }), notice),
        h(ErrorText, { text: a.error || error }),
        h('div', { className: 'nas-summary' },
          h('div', { className: 'nas-stat' }, h('div', { className: 'nas-stat-label' }, t('currentChannel')), h('div', { className: 'nas-stat-value name' }, active?.name || '—'), h('div', { className: 'nas-stat-foot' }, active?.baseURL)),
          h('div', { className: 'nas-stat' }, h('div', { className: 'nas-stat-label' }, t(q.label)), h('div', { className: 'nas-stat-value' }, q.value), h('div', { className: 'nas-stat-foot' }, b?.token?.unlimited ? t('unlimited') : b?.token?.name || '—')),
          h('div', { className: 'nas-stat' }, h('div', { className: 'nas-stat-label' }, t('totalModels')), h('div', { className: 'nas-stat-value' }, entries.length), h('div', { className: 'nas-stat-foot' }, `${t('chat')} ${count('chat')} · ${t('image')} ${count('image')} · ${t('video')} ${count('video')}`))),
        h('div', { className: 'nas-tabs', role: 'tablist', 'aria-label': t('nav') }, ['channels', 'models', 'media'].map((k) => h('button', {
          key: k, type: 'button', className: `nas-tab ${tab === k ? 'selected' : ''}`, id: `nas-tab-${k}`, role: 'tab', 'aria-selected': tab === k, 'aria-controls': `nas-panel-${k}`, tabIndex: tab === k ? 0 : -1,
          onClick: () => setTab(k), onKeyDown: (e) => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const tabs = ['channels', 'models', 'media']; const next = tabs[(tabs.indexOf(k) + (e.key === 'ArrowLeft' ? 2 : 1)) % 3]; setTab(next); document.getElementById(`nas-tab-${next}`)?.focus(); } },
        }, h(Icon, { name: k === 'channels' ? 'gateway' : k === 'models' ? 'grid' : 'image', size: 14 }), t(k), h('span', { className: 'nas-count' }, k === 'channels' ? channels.length : k === 'models' ? entries.length : (state.media?.history?.length || 0))))),
        h('div', { role: 'tabpanel', id: `nas-panel-${tab}`, 'aria-labelledby': `nas-tab-${tab}` },
          tab === 'channels' && h(React.Fragment, null,
            h('div', { className: 'nas-ch-wrap' }, h('div', { className: 'nas-ch-list', role: 'list', 'aria-label': t('channels') }, channels.map((c) => h(ChannelCard, {
              key: c.id, channel: c, count: channels.length, busy,
              onEdit: () => setEditor({ channel: c, revision: state.revision }),
              onActivate: () => operate('channel/activate', c, 'activated'), onDelete: () => operate('channel/delete', c, 'removed'),
            })))),
            h('div', { className: 'nas-note', title: t('activateHint') }, h(Icon, { name: 'info', size: 13 }), t('channelHint'))),
          tab === 'models' && modelChannel && h(React.Fragment, null,
            h('div', { className: 'nas-model-channels', role: 'tablist', 'aria-label': t('modelsOfChannel') },
              channels.map((c) => h('button', {
                key: c.id, type: 'button', role: 'tab', 'aria-selected': c.id === modelChannel.id,
                className: `nas-model-channel ${c.id === modelChannel.id ? 'selected' : ''} ${c.active ? 'is-active' : ''}`,
                'data-tip': c.active ? `${c.name} · ${t('activeTip')}` : c.name, 'data-tip-align': 'start',
                onClick: () => setModelChannelId(c.id),
              }, h(Icon, { name: c.active ? 'check' : 'gateway', size: 12 }), h('span', null, c.name),
              c.enabledCount != null && h('span', { className: 'nas-count' }, c.enabledCount)))),
            !modelChannel.active && h('div', { className: 'nas-mode warn' }, h(Icon, { name: 'info', size: 13 }), t('viewingInactive')),
            h(ModelsPanel, {
              key: modelChannel.id, state, channel: modelChannel, notify: (message) => setNotice(message),
              onEdit: (model, siblings) => setModelEditor({ model, channel: modelChannel, revision: state.revision, siblings }),
            })),
          tab === 'media' && h(Gallery, { media: state.media })),
        state.errors && Object.keys(state.errors).length > 0 && h('details', { style: { marginTop: 18 } }, h('summary', { className: 'nas-sub', style: { cursor: 'pointer' } }, t('issues')), Object.entries(state.errors).map(([key, v]) => h('div', { key, className: 'nas-note' }, `${key}: ${v.message}`))),
        h('footer', { className: 'nas-settings-foot' }, h('span', null, `${t('route')}: ${state.route?.route || 'newapi-provider'} · ${state.modelsDev?.loaded ? `models.dev ${t('cached')}` : t('originNone')}`), h('span', null, h(Icon, { name: 'key', size: 11 }), ` ${t('privacy')}`)),
        editor && h(ChannelEditor, { ...editor, onClose: () => setEditor(undefined), onSaved: () => notify('saved') }),
        modelEditor && h(ModelEditor, { ...modelEditor, onClose: () => setModelEditor(undefined), onSaved: (reset) => notify(reset ? 'modelReset' : 'modelSaved') }));
    }
    /**
     * Sidebar-foot balance. The owner passes wide=true for the expanded column,
     * false for the 56px rail, which keeps only the status dot.
     */
    function SidebarBalance({ wide = true }) {
      const t = useT(); const { state, error, busy } = useProvider(); const a = useAction();
      const active = state?.channels?.find((c) => c.id === state.activeChannel);
      const b = active?.balance || state?.balance; const q = quota(b);
      const failed = Boolean(error) || b?.status === 'error';
      const name = active?.name || 'New API';
      const detail = [
        name,
        state ? `${t(q.label)} ${q.value}` : t('loading'),
        b?.token?.unlimited ? t('unlimited') : b?.token?.name,
        failed ? (a.error || error || b?.message) : null,
        `${t('refresh')} · ${t('sidebarBalanceHint')}`,
      ].filter(Boolean).join('\n');
      return h('span', { className: 'nas nas-side-balance', 'data-wide': wide ? 'yes' : 'no' }, h(Styles),
        h('button', {
          type: 'button', className: 'nas-side-balance-btn', disabled: busy,
          'data-tip': detail, 'data-tip-align': 'start', 'aria-label': detail,
          onClick: () => a.run(() => store.mutate('refresh', {})),
        },
        h('span', { className: `nas-side-balance-dot ${failed ? 'warn' : b?.status === 'ok' ? 'ok' : ''}` }),
        wide && h('span', { className: 'nas-side-balance-main' },
          h('span', { className: 'nas-side-balance-name' }, name),
          h('span', { className: 'nas-side-balance-value' }, !state ? t('loading') : q.value)),
        h('span', { className: 'nas-side-balance-icon' }, h(Icon, { name: 'wallet', size: 15 }))));
    }
    // Tool cards use durable tool output, not text scraping.
    function resultValue(props) { const b = props.phase === 'result' ? props.block : undefined; return b?.value ?? b?.result?.value ?? b?.output; }
    function toolArgs(props) { try { const a = props.block?.args ?? props.block?.arguments; return typeof a === 'string' ? JSON.parse(a) : (typeof a === 'function' ? a() : a) || {}; } catch { return {}; } }
    function MediaToolCard(props) {
      const t = useT(); const { state } = useProvider(); const a = toolArgs(props); const value = resultValue(props);
      const isImage = props.mediaKind === 'image';
      const task = value?.taskId ? state?.media?.tasks?.find((x) => x.taskId === value.taskId) : null;
      const media = task ? state?.media?.history?.find((x) => x.taskId === task.taskId && x.file) : null;
      const error = props.block?.error?.message || (props.block?.isError ? props.block?.content?.filter((x) => x.type === 'text').map((x) => x.text).join('\n') : null);
      return h('div', { className: 'nas nas-channel' }, h(Styles),
        h('div', { className: 'nas-channel-top' }, h(Icon, { name: isImage ? 'image' : 'video' }), h('strong', null, t(isImage ? 'imageCard' : 'videoCard')), h('span', { className: 'nas-sub' }, value?.model || a.model || '')),
        props.phase !== 'result' && h('div', { className: 'nas-sub' }, t('generating')),
        error && h(ErrorText, { text: error }),
        a.prompt && h('div', { className: 'nas-prompt' }, a.prompt),
        isImage && value?.images?.length > 0 && h('div', { className: 'nas-preview' }, value.images.map((image) => h('a', { key: image.attachmentId, href: apiUrl(`media/image/${encodeURIComponent(image.attachmentId)}`), target: '_blank', rel: 'noreferrer' }, h('img', { src: apiUrl(`media/image/${encodeURIComponent(image.attachmentId)}`), alt: a.prompt || '' })))),
        !isImage && task && h(Badge, { tone: task.status === 'completed' ? 'good' : 'active' }, t(task.status === 'failed' ? 'task_failed' : task.status), task.progress != null ? ` ${task.progress}%` : ''),
        !isImage && media?.file && h('div', { className: 'nas-preview' }, h('video', { src: apiUrl(`media/video/${encodeURIComponent(media.file.id)}`), controls: true, preload: 'metadata' })),
        !isImage && value?.tasks && h('div', { className: 'nas-sub' }, value.tasks.map((x) => `${x.model}: ${t(x.status === 'failed' ? 'task_failed' : x.status)}`).join(' · ')));
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        locale = ctx.locale;
        ctx.effect(() => ctx.locale.register(NS, 'en', stringsOnly(EN)));
        ctx.effect(() => ctx.locale.register(NS, 'zh', stringsOnly(ZH)));
        translate = ctx.locale.bind(NS);
        ctx.effect(() => () => { store.dispose(); locale = undefined; translate = undefined; });
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'newapi-provider-balance', order: 30, label: translate('nav') }, SidebarBalance));
        ctx.slots.inject('settings.section', () => {
          let dispose;
          const register = () => { dispose?.(); dispose = ctx.slots.register({ name: 'settings.section', id: 'newapi-provider', order: 19, label: translate('nav') }, SettingsPage); };
          register(); const un = ctx.locale.subscribe(register);
          return () => { un(); dispose?.(); };
        });
        for (const [key, kind] of [['newapi_image_generate', 'image'], ['newapi_video_generate', 'video'], ['newapi_video_status', 'video']]) {
          ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key }, (props) => h(MediaToolCard, { ...props, mediaKind: kind })));
        }
      },
    };
  },
});
