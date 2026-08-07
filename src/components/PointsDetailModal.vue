<template>
  <div class="modal-overlay" @click.self="handleClose" @keyup.esc="handleClose">
    <div class="modal-content">
      <div class="modal-header">
        <h2>积分详情 — {{ accountName }}</h2>
        <button class="close-btn" @click="handleClose">✕</button>
      </div>

      <div class="modal-body">
        <!-- 加载中 -->
        <div v-if="loading" class="loading-state">
          <div class="spinner-lg"></div>
          <p>正在获取积分流水...</p>
        </div>

        <template v-else-if="result">
          <!-- 顶部提示条：数据来源为本地 -->
          <div v-if="result.source === 'local'" class="notice-bar">
            未获取到在线流水，仅展示本地签到记录
          </div>

          <!-- 汇总卡片 -->
          <div class="summary-card">
            <div class="summary-item">
              <span class="summary-label">当前总积分</span>
              <span class="summary-value">{{ result.totalPoints || 0 }}<span class="unit">分</span></span>
            </div>
            <div class="summary-item">
              <span class="summary-label">数据来源</span>
              <span class="badge" :class="result.source === 'api' ? 'badge-success' : 'badge-info'">
                {{ result.source === 'api' ? '在线流水' : '本地记录' }}
              </span>
            </div>
          </div>

          <!-- 分类筛选 Tab（仅 API 流水时显示） -->
          <div v-if="result.source === 'api' && transactions.length > 0" class="filter-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="filter-tab"
              :class="{ active: activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
              <span class="tab-count">{{ tab.count }}</span>
            </button>
          </div>

          <!-- 流水列表（API） -->
          <div v-if="result.source === 'api' && filteredTransactions.length > 0" class="transaction-list">
            <div
              v-for="(tx, idx) in filteredTransactions"
              :key="idx"
              class="transaction-item"
            >
              <div class="tx-type-icon" :class="tx.type">
                {{ typeIcon(tx.type) }}
              </div>
              <div class="tx-main">
                <div class="tx-description">{{ tx.description }}</div>
                <div class="tx-time">{{ formatTimestamp(tx.timestamp) }}</div>
              </div>
              <div class="tx-amount" :class="tx.amount >= 0 ? 'positive' : 'negative'">
                {{ tx.amount >= 0 ? '+' : '' }}{{ tx.amount }}
              </div>
            </div>
          </div>

          <!-- 本地签到记录列表 -->
          <div v-else-if="result.source === 'local' && localLogs.length > 0" class="transaction-list">
            <div
              v-for="log in localLogs"
              :key="log.id"
              class="transaction-item"
            >
              <div class="tx-type-icon" :class="log.result === 'success' ? 'checkin' : 'other'">
                {{ log.result === 'success' ? '✓' : '✕' }}
              </div>
              <div class="tx-main">
                <div class="tx-description">{{ log.message }}</div>
                <div class="tx-time">{{ formatTimestamp(log.time) }}</div>
              </div>
              <div class="tx-amount" :class="log.pointsGained && log.pointsGained > 0 ? 'positive' : 'neutral'">
                <template v-if="log.pointsGained && log.pointsGained > 0">+{{ log.pointsGained }}</template>
                <template v-else>—</template>
              </div>
            </div>
          </div>

          <!-- 空态 -->
          <div v-else class="empty-state">
            <div class="empty-icon">📋</div>
            <p>暂无积分流水记录</p>
          </div>
        </template>
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary" @click="handleClose">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore, type PointsDetailResult, type PointsTransaction, type CheckinLog } from '../stores/app'

const props = defineProps<{
  accountId: string
  accountName: string
}>()

const emit = defineEmits(['close'])

const store = useAppStore()
const loading = ref(true)
const result = ref<PointsDetailResult | null>(null)
const activeTab = ref<'all' | 'checkin' | 'usage' | 'gift'>('all')

const transactions = computed<PointsTransaction[]>(() => result.value?.transactions || [])
const localLogs = computed<CheckinLog[]>(() => result.value?.localCheckinLogs || [])

const tabs = computed(() => [
  { key: 'all' as const, label: '全部', count: transactions.value.length },
  { key: 'checkin' as const, label: '签到', count: transactions.value.filter(t => t.type === 'checkin').length },
  { key: 'usage' as const, label: '使用', count: transactions.value.filter(t => t.type === 'usage').length },
  { key: 'gift' as const, label: '赠送', count: transactions.value.filter(t => t.type === 'gift').length }
])

const filteredTransactions = computed(() => {
  if (activeTab.value === 'all') return transactions.value
  return transactions.value.filter(t => t.type === activeTab.value)
})

onMounted(async () => {
  try {
    result.value = await store.getPointsDetail(props.accountId)
  } catch (e) {
    console.error('获取积分详情失败:', e)
    result.value = { success: false, message: '获取失败', source: 'none' }
  } finally {
    loading.value = false
  }
})

function handleClose() {
  emit('close')
}

function typeIcon(type: PointsTransaction['type']): string {
  switch (type) {
    case 'checkin': return '✓'
    case 'usage': return '↓'
    case 'gift': return '🎁'
    default: return '•'
  }
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} 天前`
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${m}-${d} ${hh}:${mm}`
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-primary);
  border-radius: var(--radius-lg);
  width: 560px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 4px;
  border-radius: 4px;
}

.close-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-body {
  padding: 18px 22px;
  overflow-y: auto;
  flex: 1;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 14px 22px;
  border-top: 1px solid var(--border-color);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--text-secondary);
  gap: 14px;
}

.spinner-lg {
  width: 32px;
  height: 32px;
  border: 3px solid var(--bg-tertiary);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.notice-bar {
  background: rgba(245, 158, 11, 0.1);
  color: var(--warning-color);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  margin-bottom: 14px;
}

.summary-card {
  display: flex;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  margin-bottom: 16px;
}

.summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--warning-color);
  line-height: 1;
}

.summary-value .unit {
  font-size: 13px;
  font-weight: 500;
  margin-left: 4px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 500;
  width: fit-content;
}

.badge-success {
  background: rgba(16, 185, 129, 0.1);
  color: var(--success-color);
}

.badge-info {
  background: rgba(79, 70, 229, 0.1);
  color: var(--primary-color);
}

.filter-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 10px;
}

.filter-tab {
  background: none;
  border: none;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.filter-tab:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.filter-tab.active {
  background: var(--primary-light);
  color: var(--primary-color);
  font-weight: 600;
}

.tab-count {
  font-size: 11px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: 9999px;
}

.filter-tab.active .tab-count {
  background: var(--primary-color);
  color: white;
}

.transaction-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.transaction-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.transaction-item:hover {
  background: var(--bg-secondary);
}

.tx-type-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.tx-type-icon.checkin {
  background: rgba(16, 185, 129, 0.12);
  color: var(--success-color);
}

.tx-type-icon.usage {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger-color);
}

.tx-type-icon.gift {
  background: rgba(245, 158, 11, 0.12);
  color: var(--warning-color);
}

.tx-type-icon.other {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.tx-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tx-description {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tx-time {
  font-size: 11px;
  color: var(--text-muted);
}

.tx-amount {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.tx-amount.positive {
  color: var(--success-color);
}

.tx-amount.negative {
  color: var(--danger-color);
}

.tx-amount.neutral {
  color: var(--text-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 0;
  color: var(--text-muted);
  gap: 10px;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.6;
}

.empty-state p {
  font-size: 13px;
  margin: 0;
}
</style>
