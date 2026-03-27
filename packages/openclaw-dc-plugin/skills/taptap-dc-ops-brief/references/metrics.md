# TapTap 店铺运营指标口径速查（简化版）

本文件用于把 TapTap raw tools 返回的字段，映射为运营可理解的“指标名 + 口径解释”。

## 使用原则

- 报告正文优先用中文短名，首次出现时解释一次
- 不确定口径时，标注“口径待确认”，并把字段原名一并展示
- `page_view_count` 指 **详情页浏览量（PV）**
- 不要把 `page_view_count` 解读成推荐曝光或其他渠道曝光

## 常用指标

| 简报用名           | 字段名                             | 说明                  |
| ------------------ | ---------------------------------- | --------------------- |
| 详情页访问量（PV） | `page_view_count`                  | 商店详情页浏览量      |
| 下载请求量         | `download_request_count`           | 点击下载/触发下载次数 |
| 下载完成量         | `download_count`                   | 实际完成下载的次数    |
| 预约量             | `reserve_count`                    | 预约行为次数          |
| 广告下载&预约量    | `ad_download_reserve_count`        | 广告带来的下载/预约量 |
| PC 下载请求量      | `pc_download_request_count`        | PC 端触发下载的请求数 |
| 社区页面浏览量     | `topic_page_view_count`            | 社区页面 PV           |
| 评价总数           | `rating_summary.stat.review_count` | 历史累计评价数        |
