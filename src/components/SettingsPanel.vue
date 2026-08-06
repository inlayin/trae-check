<template>
  <div class="settings-panel">
    <div class="settings-section card usage-guide">
      <h3 class="section-title">使用提示</h3>
      <p class="section-desc">请先在 TRAE 桌面客户端登录账号，再导入当前桌面账号。导入后可在账号卡片中修改显示名称；签到和总积分查询会自动使用该账号凭证，签到完成后会自动刷新积分，无需反复切换账号。</p>
    </div>
    <div class="settings-section card" v-if="store.settings">
      <h3 class="section-title">自动签到</h3>
      <p class="section-desc">配置每日自动签到的时间和行为</p>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">启用自动签到</span>
          <span class="setting-desc">开启后每天在指定时间自动执行签到</span>
        </div>
        <div
          class="switch"
          :class="{ active: store.settings.autoCheckin }"
          @click="toggleAutoCheckin"
        ></div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">签到时间</span>
          <span class="setting-desc">每天自动执行签到的时间</span>
        </div>
        <input
          type="time"
          class="input time-input"
          :value="store.settings.checkinTime"
          @change="updateCheckinTime"
          :disabled="!store.settings.autoCheckin"
        />
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">失败重试次数</span>
          <span class="setting-desc">签到失败时自动重试的次数</span>
        </div>
        <select
          class="input select-input"
          :value="store.settings.retryCount"
          @change="updateRetryCount"
        >
          <option :value="0">不重试</option>
          <option :value="1">1 次</option>
          <option :value="2">2 次</option>
          <option :value="3">3 次</option>
          <option :value="5">5 次</option>
        </select>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">重试间隔</span>
          <span class="setting-desc">每次重试之间的等待时间（秒）</span>
        </div>
        <select
          class="input select-input"
          :value="store.settings.retryDelay"
          @change="updateRetryDelay"
        >
          <option :value="30">30 秒</option>
          <option :value="60">60 秒</option>
          <option :value="120">2 分钟</option>
          <option :value="300">5 分钟</option>
        </select>
      </div>
    </div>

    <div class="settings-section card" v-if="store.settings">
      <h3 class="section-title">通知设置</h3>
      <p class="section-desc">控制签到结果的桌面通知</p>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">签到成功通知</span>
          <span class="setting-desc">签到成功时显示桌面通知</span>
        </div>
        <div
          class="switch"
          :class="{ active: store.settings.notifyOnSuccess }"
          @click="toggleNotifySuccess"
        ></div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">签到失败通知</span>
          <span class="setting-desc">签到失败时显示桌面通知</span>
        </div>
        <div
          class="switch"
          :class="{ active: store.settings.notifyOnFailed }"
          @click="toggleNotifyFailed"
        ></div>
      </div>
    </div>

    <div class="settings-section card" v-if="store.settings">
      <h3 class="section-title">TRAE 桌面接口签到</h3>
      <p class="section-desc">每个账号首次导入一次；后续一键签到和定时签到会自动使用该账号的本地加密凭证。</p>

      <div class="mode-options">
        <div
          class="mode-option"
          :class="{ active: store.settings.checkinMode === 'webview' }"
          style="display: none"
        >
          <div class="mode-icon">🌐</div>
          <div class="mode-info">
            <span class="mode-name">Webview 模式</span>
            <span class="mode-desc">内置浏览器自动点击签到按钮，无需配置，推荐使用</span>
          </div>
          <div class="mode-radio" :class="{ checked: store.settings.checkinMode === 'webview' }"></div>
        </div>

        <div
          class="mode-option"
          :class="{ active: store.settings.checkinMode === 'api' }"
          style="display: none"
        >
          <div class="mode-icon">⚡</div>
          <div class="mode-info">
            <span class="mode-name">API 模式</span>
            <span class="mode-desc">直接调用签到 API，速度更快，需自行抓包配置</span>
          </div>
          <div class="mode-radio" :class="{ checked: store.settings.checkinMode === 'api' }"></div>
        </div>
      </div>

      <div class="tip-box">
        <div class="tip-icon">🔐</div>
        <div class="tip-content">
          <p class="tip-title">多账号与凭证失效</p>
          <p class="tip-desc">导入时先在 TRAE 客户端切换目标账号。凭证失效时仅需重新导入该账号，其他账号不受影响。</p>
        </div>
      </div>

      <!-- 旧 API 配置仅用于兼容已有设置，不再在界面显示。 -->
      <div class="api-config" v-if="false">
        <div class="form-group">
          <label class="form-label">签到接口地址</label>
          <input
            type="text"
            class="input"
            :value="store.settings?.apiConfig?.checkinUrl || ''"
            @input="updateApiConfig('checkinUrl', ($event.target as HTMLInputElement).value)"
            placeholder="https://api.example.com/checkin"
          />
        </div>

        <div class="form-group">
          <label class="form-label">请求方法</label>
          <select
            class="input select-input"
            :value="store.settings?.apiConfig?.method || 'POST'"
            @change="updateApiConfig('method', ($event.target as HTMLSelectElement).value)"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">请求头 (JSON 格式)</label>
          <textarea
            class="input textarea"
            rows="4"
            :value="formatJson(store.settings?.apiConfig?.headers)"
            @change="updateApiHeaders"
            placeholder='{"Authorization": "Bearer xxx"}'
          ></textarea>
          <p class="form-hint">Cookie 会自动从账号配置中注入，无需填写</p>
        </div>

        <div class="form-group">
          <label class="form-label">请求体 (JSON 格式，POST 时使用)</label>
          <textarea
            class="input textarea"
            rows="3"
            :value="formatJson(store.settings?.apiConfig?.body)"
            @change="updateApiBody"
            placeholder='{"type": "daily"}'
          ></textarea>
        </div>

        <div class="tip-box warning">
          <div class="tip-icon">⚠️</div>
          <div class="tip-content">
            <p class="tip-title">需要自行抓包获取</p>
            <p class="tip-desc">API 模式需要你通过浏览器开发者工具自行抓取签到接口的地址、请求头和参数</p>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section card">
      <h3 class="section-title">定时任务状态</h3>
      <p class="section-desc">查看当前定时任务的运行状态</p>

      <div class="status-grid">
        <div class="status-item">
          <span class="status-label">自动签到</span>
          <span class="status-value" :class="store.settings?.autoCheckin ? 'active' : 'inactive'">
            {{ store.settings?.autoCheckin ? '运行中' : '已停止' }}
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">下次执行</span>
          <span class="status-value">{{ nextRunText }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">启用账号数</span>
          <span class="status-value">{{ store.enabledAccounts.length }} 个</span>
        </div>
      </div>
    </div>

    <div class="settings-section card">
      <h3 class="section-title">关于</h3>
      <p class="section-desc">TraeCheck · TRAE Work 桌面账号签到助手</p>
      <p class="section-desc">支持多账号凭证管理、自动签到、签到后总积分刷新和账号显示名称编辑。凭证仅保存在本机，用于调用 TRAE 桌面接口。</p>

      <div class="about-info">
        <div class="about-row">
          <span class="about-label">版本</span>
          <span class="about-value">v1.0.0</span>
        </div>
        <div class="about-row">
          <span class="about-label">技术栈</span>
          <span class="about-value">Electron + Vue 3 + Vite</span>
        </div>
        <div class="about-row">
          <span class="about-label">数据存储</span>
          <span class="about-value">本地存储 (electron-store)</span>
        </div>
      </div>

      <button class="btn btn-outline check-update-btn" @click="emit('check-update')">
        检查更新
      </button>

      <div class="tip-box">
        <div class="tip-icon">💡</div>
        <div class="tip-content">
          <p class="tip-title">使用提示</p>
          <p class="tip-desc">
            1. 建议使用 Webview 模式，无需复杂配置<br>
            2. 请确保账号 Cookie 有效，失效后需重新获取<br>
            3. 自动签到需要应用保持运行状态
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const emit = defineEmits(['check-update'])

const nextRunText = computed(() => {
  if (!store.settings?.autoCheckin) return '未启用'
  if (!store.nextRunTime) return '计算中...'

  const nextTime = new Date(store.nextRunTime)
  const now = new Date()
  const diff = nextTime.getTime() - now.getTime()

  if (diff <= 0) return '即将执行'

  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)

  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分钟后`
  }
  return `${minutes} 分钟后`
})

async function toggleAutoCheckin() {
  if (!store.settings) return
  await store.saveSettings({ autoCheckin: !store.settings.autoCheckin })
}

async function updateCheckinTime(e: Event) {
  const value = (e.target as HTMLInputElement).value
  await store.saveSettings({ checkinTime: value })
}

async function updateRetryCount(e: Event) {
  const value = parseInt((e.target as HTMLSelectElement).value)
  await store.saveSettings({ retryCount: value })
}

async function updateRetryDelay(e: Event) {
  const value = parseInt((e.target as HTMLSelectElement).value)
  await store.saveSettings({ retryDelay: value })
}

async function toggleNotifySuccess() {
  if (!store.settings) return
  await store.saveSettings({ notifyOnSuccess: !store.settings.notifyOnSuccess })
}

async function toggleNotifyFailed() {
  if (!store.settings) return
  await store.saveSettings({ notifyOnFailed: !store.settings.notifyOnFailed })
}

async function setCheckinMode(mode: 'webview' | 'api') {
  await store.saveSettings({ checkinMode: mode })
}

async function updateApiConfig(key: string, value: string) {
  if (!store.settings) return
  const current = store.settings.apiConfig || {
    checkinUrl: '',
    method: 'POST' as const,
    headers: {}
  }
  await store.saveSettings({
    apiConfig: {
      ...current,
      [key]: value
    }
  })
}

async function updateApiHeaders(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  try {
    const headers = value.trim() ? JSON.parse(value) : {}
    if (!store.settings) return
    const current = store.settings.apiConfig || {
      checkinUrl: '',
      method: 'POST' as const,
      headers: {}
    }
    await store.saveSettings({
      apiConfig: {
        ...current,
        headers
      }
    })
  } catch {
    // JSON 解析失败，暂时不保存
  }
}

async function updateApiBody(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  try {
    const body = value.trim() ? JSON.parse(value) : undefined
    if (!store.settings) return
    const current = store.settings.apiConfig || {
      checkinUrl: '',
      method: 'POST' as const,
      headers: {}
    }
    await store.saveSettings({
      apiConfig: {
        ...current,
        body
      }
    })
  } catch {
    // JSON 解析失败，暂时不保存
  }
}

function formatJson(obj?: Record<string, any>): string {
  if (!obj || Object.keys(obj).length === 0) return ''
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return ''
  }
}
</script>

<style scoped>
.settings-panel {
  max-width: 720px;
  margin: 0 auto;
}

.settings-section {
  padding: 24px;
  margin-bottom: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.section-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--border-color);
}

.setting-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.setting-info {
  flex: 1;
}

.setting-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.setting-desc {
  font-size: 12px;
  color: var(--text-muted);
}

.time-input {
  width: 120px;
  text-align: center;
}

.select-input {
  width: 140px;
}

/* 模式选择 */
.mode-options {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-option:hover {
  border-color: var(--primary-light);
}

.mode-option.active {
  border-color: var(--primary-color);
  background: var(--primary-light);
}

.mode-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.mode-info {
  flex: 1;
}

.mode-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.mode-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.mode-radio {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
}

.mode-radio.checked {
  border-color: var(--primary-color);
}

.mode-radio.checked::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background: var(--primary-color);
  border-radius: 50%;
}

/* API 配置 */
.api-config {
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.textarea {
  resize: vertical;
  min-height: 80px;
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
}

.form-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

/* 状态网格 */
.status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.status-item {
  text-align: center;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
}

.status-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.status-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.status-value.active {
  color: var(--success-color);
}

.status-value.inactive {
  color: var(--text-muted);
}

/* 关于 */
.about-info {
  margin-bottom: 16px;
}

.about-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.about-row:last-child {
  border-bottom: none;
}

.about-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.about-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.check-update-btn {
  margin-top: 16px;
}

/* 提示框 */
.tip-box {
  display: flex;
  gap: 12px;
  padding: 14px;
  background: var(--primary-light);
  border-radius: var(--radius-sm);
  margin-top: 16px;
}

.tip-box.warning {
  background: #fef3c7;
}

.tip-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.tip-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-color);
  margin-bottom: 4px;
}

.tip-box.warning .tip-title {
  color: #92400e;
}

.tip-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
}
</style>
