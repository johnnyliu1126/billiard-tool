# 照片识别验证记录

验证日期：2026-09-15。测试使用原图最长边缩放到 1200 像素，与手机导入流程一致。图片只用于本地验证，没有加入仓库。

## 真实照片

以下 6 张照片来自 Wikimedia Commons；页面列出的授权允许本次测试使用。

| 样本 | 授权 | 人工可见球数 | 自动结果 | 漏检与误检观察 |
| --- | --- | ---: | --- | --- |
| [Billiard table.JPG](https://commons.wikimedia.org/wiki/File:Billiard_table.JPG) | CC BY-SA 3.0 | 16 | 16 个标记，含 1 个母球 | 数量吻合；密集球堆中仍无法仅凭数量证明逐球均匹配 |
| [Billiard table in Nurmijärvi, Finland](https://commons.wikimedia.org/wiki/File:Billiard_table_in_Nurmij%C3%A4rvi%2C_Finland.jpg) | CC BY-SA 4.0 | 0 | 1 个标记 | 1 个灯光/背景误检，0 个漏检 |
| [Billiards Table.JPG](https://commons.wikimedia.org/wiki/File:Billiards_Table.JPG) | CC0 | 12 | 16 个标记 | 球杆产生误检，同一球的高光会产生重复标记；四角范围偏移也造成漏检，必须人工校正 |
| [Billiards table 2.JPG](https://commons.wikimedia.org/wiki/File:Billiards_table_2.JPG) | CC0 | 15 | 16 个标记 | 球杆和阴影产生误检；部分花色球出现重复标记 |
| [Billiards table 3.jpg](https://commons.wikimedia.org/wiki/File:Billiards_table_3.jpg) | CC0 | 1 | 未识别到台面 | 蓝色台呢在暗光和远景下整桌漏检，球也未进入后续检测 |
| [UF Reitz Union Green Felt Pool Table Balls](https://commons.wikimedia.org/wiki/File:UF_Reitz_Union_Green_Felt_Pool_Table_Balls_(4603067908).jpg) | CC BY 2.0 | 15 | 16 个标记 | 密集贴球中有重复标记，并把一个高光候选指定成母球 |

这组样本覆盖暗光、强反光、球杆、密集贴球、蓝/绿色台呢和斜拍。自动识别只适合生成可编辑初稿：6 张中 1 张数量吻合，1 张台面检测失败，其余 4 张存在误检、重复标记或漏检。样本量很小，也没有制作逐像素/逐球标注集，因此不能据此给出“识别准确率”。

## 合成回归图

自动化测试另有 6 类合成图：绿色球、柔和阴影、两个贴球、小白色反光点、竖拍台面和透视台面。它们用于稳定复现单一问题，当前均通过；这些结果不代表真实球房照片的统计表现。

本轮据此加入原图叠加和完整人工校正：拖动台面四角、移动球心、补球、删误检、重新指定母球，以及显式多选合法目标。真实照片暴露的自动检测限制仍保留在本记录中，后续需要更大且逐球标注的数据集才能继续改进自动模型。
