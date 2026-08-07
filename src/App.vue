<template>
  <div class="app-shell">
    <AppTitleBar />
    <div class="app-container">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <nav class="nav-menu">
        <div
          class="nav-item"
          :class="{ active: activeTab === 'accounts' }"
          @click="activeTab = 'accounts'"
        >
          <span class="nav-icon">👥</span>
          <span>账号管理</span>
          <span class="nav-badge" v-if="store.accounts.length">{{ store.accounts.length }}</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: activeTab === 'logs' }"
          @click="activeTab = 'logs'"
        >
          <span class="nav-icon">📋</span>
          <span>签到日志</span>
        </div>
        <div
          class="nav-item"
          :class="{ active: activeTab === 'settings' }"
          @click="activeTab = 'settings'"
        >
          <span class="nav-icon">⚙️</span>
          <span>设置</span>
        </div>
      </nav>

      <div class="sidebar-footer">
        <div class="status-card">
          <div class="status-item">
            <span class="status-label">自动签到</span>
            <span class="status-value" :class="store.settings?.autoCheckin ? 'on' : 'off'">
              {{ store.settings?.autoCheckin ? '已开启' : '已关闭' }}
            </span>
          </div>
          <div class="status-item" v-if="store.settings?.autoCheckin">
            <span class="status-label">签到时间</span>
            <span class="status-value">{{ store.settings?.checkinTime }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">今日已签</span>
            <span class="status-value success">{{ store.todayCheckedCount }} / {{ store.enabledAccounts.length }}</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="top-toast-container">
      <div v-for="toast in toasts" :key="toast.id" class="top-toast" :class="toast.type">{{ toast.message }}</div>
    </div>

    <main class="main-content">
      <!-- 顶部栏 -->
      <header class="top-bar">
        <div class="top-bar-left">
          <h1 class="page-title">{{ currentPageTitle }}</h1>
          <p class="page-subtitle" v-if="activeTab === 'accounts'">管理你的 Trae Work 账号，一键签到</p>
          <p class="page-subtitle" v-else-if="activeTab === 'logs'">查看所有签到记录和结果</p>
          <p class="page-subtitle" v-else>配置自动签到和通知设置</p>
        </div>
        <div class="top-bar-right">
          <button
            class="btn btn-primary"
            @click="handleCheckinAll"
            :disabled="store.checkingIn || store.enabledAccounts.length === 0"
            v-if="activeTab === 'accounts'"
          >
            <span v-if="store.checkingIn" class="spinner"></span>
            <span>{{ store.checkingIn ? '签到中...' : '一键签到全部' }}</span>
          </button>
          <button
            class="btn btn-outline"
            @click="handleExport"
            :disabled="store.accounts.length === 0"
            v-if="activeTab === 'accounts'"
          >
            <span>导出</span>
          </button>
          <button
            class="btn btn-outline"
            @click="handleImport"
            v-if="activeTab === 'accounts'"
          >
            <span>导入</span>
          </button>
          <button
            class="btn btn-primary"
            @click="showAddModal = true"
            v-if="activeTab === 'accounts'"
          >
            <span>＋</span>
            <span>添加账号</span>
          </button>
        </div>
      </header>

      <!-- 内容区域 -->
      <div class="content-area">
        <AccountList v-if="activeTab === 'accounts'" @add-account="showAddModal = true" @notify="showToast" />
        <CheckinLog v-else-if="activeTab === 'logs'" />
        <SettingsPanel v-else @check-update="checkForUpdates(true)" />
      </div>
    </main>

    <!-- 添加账号弹窗 -->
    <AddAccountModal
      v-model:visible="showAddModal"
      @success="handleAddSuccess"
    />

    <!-- 导出弹窗 -->
    <ExportModal
      v-model:visible="showExportModal"
      @success="handleExportSuccess"
    />

    <!-- 导入弹窗 -->
    <ImportModal
      v-model:visible="showImportModal"
      :filePath="importFilePath"
      :fileName="importFileName"
      :hasCredentials="importHasCredentials"
      @imported="handleImported"
    />

    <!-- 更新弹窗 -->
    <UpdateModal v-model:visible="showUpdateModal" :info="updateInfo" />
    </div>

    <!-- 全局确认弹窗 -->
    <ConfirmDialog
      v-model:visible="confirmVisible"
      :title="confirmTitle"
      :message="confirmMessage"
      :type="confirmType"
      :confirmText="confirmText"
      :cancelText="cancelText"
      :showCancel="confirmShowCancel"
      @confirm="handleConfirmResult(true)"
      @cancel="handleConfirmResult(false)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, provide } from 'vue'
import { useAppStore } from './stores/app'
import AccountList from './components/AccountList.vue'
import CheckinLog from './components/CheckinLog.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import AddAccountModal from './components/AddAccountModal.vue'
import ExportModal from './components/ExportModal.vue'
import ImportModal from './components/ImportModal.vue'
import UpdateModal from './components/UpdateModal.vue'
import AppTitleBar from './components/AppTitleBar.vue'
import ConfirmDialog, { type ConfirmType } from './components/ConfirmDialog.vue'

const store = useAppStore()
const activeTab = ref<'accounts' | 'logs' | 'settings'>('accounts')
const showAddModal = ref(false)
const showExportModal = ref(false)
const showImportModal = ref(false)
const importFilePath = ref('')
const importFileName = ref('')
const importHasCredentials = ref(false)
const showUpdateModal = ref(false)
const updateInfo = ref<{ version: string; releaseNotes: string; releaseDate: string } | null>(null)
const manualCheck = ref(false)

let unsubAvailable: (() => void) | undefined
let unsubNotAvailable: (() => void) | undefined
let unsubError: (() => void) | undefined
let unsubDownloaded: (() => void) | undefined

function checkForUpdates(manual: boolean) {
  manualCheck.value = manual
  void window.electronAPI.updater.check()
}

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error'
}
const toasts = ref<ToastItem[]>([])
let toastIdSeed = 0

function showToast(message: string, type: 'success' | 'error' = 'success') {
  const id = ++toastIdSeed
  toasts.value.push({ id, message, type })
  setTimeout(() => {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }, 3500)
}

// ========== 全局确认弹窗 ==========
const confirmVisible = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmType = ref<ConfirmType>('info')
const confirmText = ref('确定')
const cancelText = ref('取消')
const confirmShowCancel = ref(true)
let confirmResolve: ((value: boolean) => void) | null = null

function showConfirm(options: {
  title: string
  message?: string
  type?: ConfirmType
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
}): Promise<boolean> {
  confirmTitle.value = options.title
  confirmMessage.value = options.message || ''
  confirmType.value = options.type || 'info'
  confirmText.value = options.confirmText || '确定'
  cancelText.value = options.cancelText || '取消'
  confirmShowCancel.value = options.showCancel !== false
  confirmVisible.value = true
  return new Promise((resolve) => { confirmResolve = resolve })
}

function handleConfirmResult(result: boolean) {
  confirmVisible.value = false
  confirmResolve?.(result)
  confirmResolve = null
}

// 全局 alert（单按钮确认）
function showAlert(title: string, message?: string, type: ConfirmType = 'info') {
  return showConfirm({ title, message, type, showCancel: false })
}

// provide 给子组件
provide('showConfirm', showConfirm)
provide('showAlert', showAlert)
provide('showToast', showToast)

const currentPageTitle = computed(() => {
  switch (activeTab.value) {
    case 'accounts': return '账号管理'
    case 'logs': return '签到日志'
    case 'settings': return '设置'
    default: return ''
  }
})

async function handleCheckinAll() {
  if (store.enabledAccounts.length === 0) {
    void showAlert('提示', '请先添加并启用账号', 'warning')
    return
  }
  await store.checkinAll()
}

function handleAddSuccess() {
  showAddModal.value = false
}

function handleExport() {
  showExportModal.value = true
}

function handleExportSuccess(filePath?: string) {
  showExportModal.value = false
  showToast(filePath ? `已导出到：${filePath}` : '导出成功', 'success')
}

async function handleImport() {
  const pickResult = await store.pickImportFile()
  if (pickResult && pickResult.canceled) {
    return
  }
  if (!pickResult || !pickResult.success) {
    showToast(pickResult?.message || '选择文件失败', 'error')
    return
  }
  importFilePath.value = pickResult.filePath
  importFileName.value = pickResult.filePath.split(/[\\/]/).pop() || ''
  importHasCredentials.value = pickResult.hasCredentials
  showImportModal.value = true
}

function handleImported(message: string) {
  showImportModal.value = false
  showToast(message, 'success')
}

onMounted(() => {
  store.init()
  console.log('[App] onMounted, 注册更新监听器')

  // 在线更新事件监听
  unsubAvailable = window.electronAPI.updater.onAvailable((info) => {
    console.log('[App] 收到 update:available 事件', info)
    updateInfo.value = info
    showUpdateModal.value = true
  })
  unsubNotAvailable = window.electronAPI.updater.onNotAvailable(() => {
    if (manualCheck.value) {
      showToast('当前已是最新版本', 'success')
      manualCheck.value = false
    }
  })
  unsubError = window.electronAPI.updater.onError((message) => {
    if (manualCheck.value) {
      showToast('检查更新失败：' + message, 'error')
      manualCheck.value = false
    }
  })
  unsubDownloaded = window.electronAPI.updater.onDownloaded(() => {
    if (!showUpdateModal.value) {
      showToast('更新已就绪，下次退出时自动安装', 'success')
    }
  })
})

onUnmounted(() => {
  unsubAvailable?.()
  unsubNotAvailable?.()
  unsubError?.()
  unsubDownloaded?.()
})
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.app-container {
  display: flex;
  width: 100%;
  flex: 1;
  overflow: hidden;
}

.top-toast-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}

.top-toast {
  padding: 12px 22px;
  border-radius: 10px;
  color: white;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .22);
}
.top-toast.success { background: #16a34a; }
.top-toast.error { background: #dc2626; }

/* 侧边栏 */
.sidebar {
  width: 240px;
  background: linear-gradient(180deg, #1e1b4b 0%, #312e81 100%);
  display: flex;
  flex-direction: column;
  color: white;
}

.nav-menu {
  flex: 1;
  padding: 12px 12px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  margin-bottom: 4px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  font-weight: 500;
}

.nav-icon {
  font-size: 16px;
}

.nav-badge {
  margin-left: auto;
  background: var(--primary-color);
  color: white;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.status-card {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 14px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.status-item:last-child {
  margin-bottom: 0;
}

.status-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.status-value {
  font-size: 13px;
  font-weight: 500;
}

.status-value.on {
  color: #34d399;
}

.status-value.off {
  color: rgba(255, 255, 255, 0.5);
}

.status-value.success {
  color: #34d399;
}

/* 主内容区 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 28px;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.top-bar-right {
  display: flex;
  gap: 10px;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}
</style>
