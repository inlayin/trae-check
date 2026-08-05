<template>
  <div class="checkin-log">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="filter-tabs">
          <button
            class="filter-tab"
            :class="{ active: filter === 'all' }"
            @click="filter = 'all'"
          >
            全部
            <span class="count">{{ store.logs.length }}</span>
          </button>
          <button
            class="filter-tab"
            :class="{ active: filter === 'success' }"
            @click="filter = 'success'"
          >
            成功
            <span class="count success">{{ successCount }}</span>
          </button>
          <button
            class="filter-tab"
            :class="{ active: filter === 'failed' }"
            @click="filter = 'failed'"
          >
            失败
            <span class="count danger">{{ failedCount }}</span>
          </button>
        </div>
      </div>
      <div class="toolbar-right">
        <button class="btn btn-sm btn-outline" @click="handleRefresh">
          🔄 刷新
        </button>
        <button
          class="btn btn-sm btn-outline danger"
          @click="handleClear"
          :disabled="store.logs.length === 0"
        >
          🗑 清空日志
        </button>
      </div>
    </div>

    <!-- 日志列表 -->
    <div class="log-list card" v-if="filteredLogs.length > 0">
      <div class="log-table">
        <div class="log-header">
          <div class="col-time">时间</div>
          <div class="col-account">账号</div>
          <div class="col-result">结果</div>
          <div class="col-message">详情</div>
          <div class="col-points">积分</div>
        </div>
        <div class="log-body">
          <div
            class="log-row"
            v-for="log in filteredLogs"
            :key="log.id"
          >
            <div class="col-time">{{ formatTime(log.time) }}</div>
            <div class="col-account">
              <span class="account-tag">{{ log.accountName }}</span>
            </div>
            <div class="col-result">
              <span class="badge" :class="log.result === 'success' ? 'badge-success' : 'badge-danger'">
                {{ log.result === 'success' ? '成功' : '失败' }}
              </span>
            </div>
            <div class="col-message">
              <span class="message-text" :title="log.message">
                {{ log.message }}
              </span>
            </div>
            <div class="col-points">
              <span v-if="log.pointsGained" class="points-gain">+{{ log.pointsGained }}</span>
              <span v-else class="points-none">-</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="empty-state" v-else>
      <div class="empty-state-icon">📝</div>
      <p class="empty-state-text">暂无签到记录</p>
      <p class="empty-state-desc">执行签到后会在这里显示记录</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '../stores/app'

const store = useAppStore()
const filter = ref<'all' | 'success' | 'failed'>('all')

const filteredLogs = computed(() => {
  if (filter.value === 'all') return store.logs
  return store.logs.filter(l => l.result === filter.value)
})

const successCount = computed(() => store.logs.filter(l => l.result === 'success').length)
const failedCount = computed(() => store.logs.filter(l => l.result === 'failed').length)

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}:${seconds}`
}

async function handleRefresh() {
  await store.fetchLogs()
}

async function handleClear() {
  if (confirm('确定要清空所有签到日志吗？此操作不可恢复。')) {
    await store.clearLogs()
  }
}

onMounted(() => {
  store.fetchLogs()
})
</script>

<style scoped>
.checkin-log {
  max-width: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.filter-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 3px;
}

.filter-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.filter-tab:hover {
  color: var(--text-primary);
}

.filter-tab.active {
  background: var(--primary-color);
  color: white;
}

.filter-tab .count {
  font-size: 11px;
  padding: 1px 6px;
  background: var(--bg-tertiary);
  border-radius: 10px;
}

.filter-tab.active .count {
  background: rgba(255, 255, 255, 0.2);
}

.filter-tab .count.success {
  color: var(--success-color);
}

.filter-tab.active .count.success {
  color: white;
}

.filter-tab .count.danger {
  color: var(--danger-color);
}

.filter-tab.active .count.danger {
  color: white;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.btn-outline.danger {
  color: var(--danger-color);
  border-color: #fecaca;
}

.btn-outline.danger:hover:not(:disabled) {
  background-color: #fef2f2;
}

.log-list {
  overflow: hidden;
}

.log-table {
  width: 100%;
}

.log-header {
  display: flex;
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.log-body {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
}

.log-row {
  display: flex;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  transition: background 0.15s ease;
}

.log-row:last-child {
  border-bottom: none;
}

.log-row:hover {
  background: var(--bg-secondary);
}

.col-time {
  width: 140px;
  flex-shrink: 0;
  color: var(--text-secondary);
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 12px;
}

.col-account {
  width: 120px;
  flex-shrink: 0;
}

.account-tag {
  display: inline-block;
  padding: 2px 8px;
  background: var(--primary-light);
  color: var(--primary-color);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.col-result {
  width: 80px;
  flex-shrink: 0;
}

.col-message {
  flex: 1;
  min-width: 0;
  padding-right: 16px;
}

.message-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.col-points {
  width: 80px;
  flex-shrink: 0;
  text-align: right;
}

.points-gain {
  color: var(--success-color);
  font-weight: 600;
}

.points-none {
  color: var(--text-muted);
}

.empty-state-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 6px;
}
</style>
