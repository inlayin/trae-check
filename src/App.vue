<template>
  <div class="app-shell">
    <AppTitleBar />
    <div class="app-container">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <span class="logo-icon">✓</span>
          <span class="logo-text">TraeCheck</span>
        </div>
        <p class="logo-desc">每日自动签到工具</p>
      </div>

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
    <div v-if="toastMessage" class="top-toast" :class="toastType">{{ toastMessage }}</div>

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
        <SettingsPanel v-else />
      </div>
    </main>

    <!-- 添加账号弹窗 -->
    <AddAccountModal
      v-model:visible="showAddModal"
      @success="handleAddSuccess"
    />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from './stores/app'
import AccountList from './components/AccountList.vue'
import CheckinLog from './components/CheckinLog.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import AddAccountModal from './components/AddAccountModal.vue'
import AppTitleBar from './components/AppTitleBar.vue'

const store = useAppStore()
const activeTab = ref<'accounts' | 'logs' | 'settings'>('accounts')
const showAddModal = ref(false)

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
    alert('请先添加并启用账号')
    return
  }
  await store.checkinAll()
}

function handleAddSuccess() {
  showAddModal.value = false
}

onMounted(() => {
  store.init()
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

.sidebar-header {
  padding: 24px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.logo-icon {
  width: 32px;
  height: 32px;
  background: var(--primary-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 18px;
}

.logo-text {
  font-size: 18px;
  font-weight: 600;
}

.logo-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-left: 42px;
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
