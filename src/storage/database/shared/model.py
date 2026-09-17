from coze_coding_dev_sdk.database import Base

from sqlalchemy import BigInteger, Boolean, Column, DateTime, Double, ForeignKey, Index, Integer, Numeric, PrimaryKeyConstraint, String, Table, Text, text, func
from sqlalchemy.dialects.postgresql import OID
from typing import Optional
import datetime

from sqlalchemy.orm import Mapped, mapped_column

class HealthCheck(Base):
    __tablename__ = 'health_check'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='health_check_pkey'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(True), server_default=text('now()'))


t_pg_stat_statements = Table(
    'pg_stat_statements', Base.metadata,
    Column('userid', OID),
    Column('dbid', OID),
    Column('toplevel', Boolean),
    Column('queryid', BigInteger),
    Column('query', Text),
    Column('plans', BigInteger),
    Column('total_plan_time', Double(53)),
    Column('min_plan_time', Double(53)),
    Column('max_plan_time', Double(53)),
    Column('mean_plan_time', Double(53)),
    Column('stddev_plan_time', Double(53)),
    Column('calls', BigInteger),
    Column('total_exec_time', Double(53)),
    Column('min_exec_time', Double(53)),
    Column('max_exec_time', Double(53)),
    Column('mean_exec_time', Double(53)),
    Column('stddev_exec_time', Double(53)),
    Column('rows', BigInteger),
    Column('shared_blks_hit', BigInteger),
    Column('shared_blks_read', BigInteger),
    Column('shared_blks_written', BigInteger),
    Column('local_blks_hit', BigInteger),
    Column('local_blks_read', BigInteger),
    Column('local_blks_written', BigInteger),
    Column('temp_blks_read', BigInteger),
    Column('temp_blks_written', BigInteger),
    Column('shared_blk_read_time', Double(53)),
    Column('shared_blk_write_time', Double(53)),
    Column('local_blk_read_time', Double(53)),
    Column('local_blk_write_time', Double(53)),
    Column('temp_blk_read_time', Double(53)),
    Column('temp_blk_write_time', Double(53)),
    Column('wal_records', BigInteger),
    Column('wal_fpi', BigInteger),
    Column('wal_bytes', Numeric),
    Column('jit_functions', BigInteger),
    Column('jit_generation_time', Double(53)),
    Column('jit_inlining_count', BigInteger),
    Column('jit_inlining_time', Double(53)),
    Column('jit_optimization_count', BigInteger),
    Column('jit_optimization_time', Double(53)),
    Column('jit_emission_count', BigInteger),
    Column('jit_emission_time', Double(53)),
    Column('jit_deform_count', BigInteger),
    Column('jit_deform_time', Double(53)),
    Column('stats_since', DateTime(True)),
    Column('minmax_stats_since', DateTime(True))
)


t_pg_stat_statements_info = Table(
    'pg_stat_statements_info', Base.metadata,
    Column('dealloc', BigInteger),
    Column('stats_reset', DateTime(True))
)


class RepairUser(Base):
    """报修用户表（微信登录身份）"""
    __tablename__ = 'repair_users'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, server_default=text('gen_random_uuid()'))
    openid: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, comment='微信 openid')
    nick_name: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, comment='微信昵称')
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True, comment='微信头像')
    phone: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, comment='最近使用的联系电话')
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index('repair_users_openid_idx', 'openid', unique=True),
    )


class RepairWorker(Base):
    """维修员档案表"""
    __tablename__ = 'repair_workers'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, server_default=text('gen_random_uuid()'))
    name: Mapped[str] = mapped_column(String(64), nullable=False, comment='维修员姓名')
    phone: Mapped[str] = mapped_column(String(32), nullable=False, comment='联系电话')
    trade: Mapped[str] = mapped_column(String(64), nullable=False, comment='维修工种')
    latitude: Mapped[float] = mapped_column(Double, nullable=False, comment='当前位置纬度')
    longitude: Mapped[float] = mapped_column(Double, nullable=False, comment='当前位置经度')
    online: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'), comment='是否在线接单')
    wx_openid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True, comment='微信 openid')
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index('repair_workers_trade_idx', 'trade'),
        Index('repair_workers_online_idx', 'online'),
        Index('repair_workers_openid_idx', 'wx_openid', unique=True),
    )


class RepairOrder(Base):
    """维修申报订单表"""
    __tablename__ = 'repair_orders'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, server_default=text('gen_random_uuid()'))
    category: Mapped[str] = mapped_column(String(64), nullable=False, comment='故障类型')
    description: Mapped[str] = mapped_column(Text, nullable=False, comment='故障描述')
    address: Mapped[str] = mapped_column(String(255), nullable=False, comment='上门地址')
    contact_name: Mapped[str] = mapped_column(String(64), nullable=False, comment='联系人')
    contact_phone: Mapped[str] = mapped_column(String(32), nullable=False, comment='联系电话')
    latitude: Mapped[float] = mapped_column(Double, nullable=False, comment='报修位置纬度')
    longitude: Mapped[float] = mapped_column(Double, nullable=False, comment='报修位置经度')
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default='pending', comment='状态: pending/accepted/repairing/completed/cancelled')
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey('repair_users.id'), nullable=True, comment='下单用户')
    worker_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey('repair_workers.id'), nullable=True, comment='接单维修员')
    scheduled_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment='约定上门时间')
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (
        Index('repair_orders_status_idx', 'status'),
        Index('repair_orders_user_id_idx', 'user_id'),
        Index('repair_orders_worker_id_idx', 'worker_id'),
        Index('repair_orders_created_at_idx', 'created_at'),
    )


class PowderOrder(Base):
    """预拌粉购买订单表"""
    __tablename__ = 'powder_orders'

    id: Mapped[str] = mapped_column(String(36), primary_key=True, server_default=text('gen_random_uuid()'))
    order_no: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, comment='业务订单号')
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey('repair_users.id'), nullable=True, comment='下单用户')
    product_name: Mapped[str] = mapped_column(String(100), nullable=False, server_default='预拌粉', comment='商品名称')
    amount_fen: Mapped[int] = mapped_column(BigInteger, nullable=False, comment='支付金额（分）')
    pay_channel: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, comment='支付渠道: wechat/alipay/bankcard')
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default='pending', comment='状态: pending/paid/failed/cancelled')
    transaction_no: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, comment='第三方支付流水号')
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment='备注')
    paid_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment='支付完成时间')
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (
        Index('powder_orders_order_no_idx', 'order_no', unique=True),
        Index('powder_orders_user_id_idx', 'user_id'),
        Index('powder_orders_status_idx', 'status'),
        Index('powder_orders_created_at_idx', 'created_at'),
    )
