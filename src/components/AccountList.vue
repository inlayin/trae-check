<template>
  <div class="account-list">
    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-icon total">👥</div>
        <div class="stat-info">
          <span class="stat-value">{{ store.accounts.length }}</span>
          <span class="stat-label">总账号数</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon enabled">✓</div>
        <div class="stat-info">
          <span class="stat-value">{{ store.enabledAccounts.length }}</span>
          <span class="stat-label">已启用</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon success">🎉</div>
        <div class="stat-info">
          <span class="stat-value">{{ store.todayCheckedCount }}</span>
          <span class="stat-label">今日已签到</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon points">💰</div>
        <div class="stat-info">
          <span class="stat-value">{{ totalPoints }}</span>
          <span class="stat-label">总积分</span>
        </div>
      </div>
    </div>

    <!-- 账号列表 -->
    <div class="accounts-grid" v-if="store.accounts.length > 0">
      <AccountCard
        v-for="account in store.accounts"
        :key="account.id"
        :account="account"
        @checkin="handleCheckin"
        @toggle="handleToggle"
        @delete="handleDelete"
        @edit="handleEdit"
        @set-local="handleSetLocal"
        @points-detail="handlePointsDetail"
      />
    </div>

    <!-- 空状态 -->
    <div class="empty-state" v-else>
      <div class="empty-state-icon">📭</div>
      <p class="empty-state-text">还没有添加账号</p>
      <p class="empty-state-desc">点击右上角「添加账号」按钮开始使用</p>
      <button class="btn btn-primary" style="margin-top: 20px" @click="$emit('add-account')">
        ＋ 添加第一个账号
      </button>
    </div>

    <!-- 积分详情模态框 -->
    <PointsDetailModal
      v-if="pointsDetailVisible"
      :account-id="pointsDetailAccountId"
      :account-name="pointsDetailAccountName"
      @close="pointsDetailVisible = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import { useAppStore } from '../stores/app'
import AccountCard from './AccountCard.vue'
import PointsDetailModal from './PointsDetailModal.vue'

const store = useAppStore()
const emit = defineEmits(['add-account', 'notify'])
const showConfirm = inject<(o: { title: string; message?: string; type?: string; confirmText?: string; cancelText?: string }) => Promise<boolean>>('showConfirm')!

const pointsDetailVisible = ref(false)
const pointsDetailAccountId = ref('')
const pointsDetailAccountName = ref('')

const totalPoints = computed(() => {
  return store.accounts.reduce((sum, a) => sum + (a.points || 0), 0)
})

async function handleCheckin(id: string) {
  const result = await store.checkinAccount(id)
  emit('notify', result?.success ? (result.message || '签到成功') : (result?.message || '签到失败'), result?.success ? 'success' : 'error')
  const points = await store.getAccountPoints(id)
  emit('notify', points?.success ? '当前总积分已更新' : (points?.message || '当前总积分查询失败'), points?.success ? 'success' : 'error')
}

async function handleToggle(id: string, enabled: boolean) {
  await store.updateAccount(id, { enabled })
}

async function handleDelete(id: string) {
  const confirmed = await showConfirm({
    title: '删除账号',
    message: '确定要删除这个账号吗？此操作不可恢复。',
    type: 'danger',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (confirmed) {
    await store.deleteAccount(id)
  }
}

function handleEdit(id: string, newName?: string) {
  if (!newName) return
  void store.updateAccount(id, { name: newName })
}

async function handleSetLocal(id: string) {
  const confirmed = await showConfirm({
    title: '设置为本地账号',
    message: '将把该账号凭证写入 TRAE 桌面客户端并自动重启 TRAE 使切换即时生效。\n⚠️ 强制结束 TRAE 进程会丢失未保存的编辑内容，请先在 TRAE 内保存；操作前会自动备份 storage.json。',
    type: 'warning',
    confirmText: '确认切换并重启',
    cancelText: '取消'
  })
  if (!confirmed) return
  const result = await store.setLocalAccount(id)
  emit('notify',
    result?.success ? result.message : `切换失败：${result?.message || '未知错误'}`,
    result?.success ? 'success' : 'error')
}

function handlePointsDetail(id: string) {
  const account = store.accounts.find(a => a.id === id)
  pointsDetailAccountId.value = id
  pointsDetailAccountName.value = account?.name || ''
  pointsDetailVisible.value = true
}
</script>

<style scoped>
.account-list {
  max-width: 100%;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: var(--shadow-sm);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}

.stat-icon.total {
  background: #eff6ff;
}

.stat-icon.enabled {
  background: #dcfce7;
}

.stat-icon.success {
  background: #fef3c7;
}

.stat-icon.points {
  background: #fce7f3;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.accounts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.empty-state-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-top: 6px;
}
</style>
