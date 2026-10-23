# シナリオ別の機会と提示条件（仕様案）

版 0.2。対象は [10シナリオの文脈データ](data/scenario-bindings.json) と [イベント原稿](data/events-initial.json)。ここでいう「機会」は、その地域・年代であり得る学び・仕事・移動・ケアの経路であり、主人公への提供を意味しない。下記の資料は経路の存在を確かめる手がかりで、参加率・費用・成功確率・誰に許されたかをそのまま与えない。未入手の条件は [機会・健康イベント推定値](data/scenario-opportunity-estimates.json) の初期レンジで補い、史実の参加率と区別する。現時点では全シナリオを公開無効のままにする。

## 1. 機会の候補と確認範囲

| 文脈 | 学びの候補 | 生業の候補 | 移動・生活の候補 | まだ決められないこと |
|---|---|---|---|---|
| 東北農村 1720–1870 | 家族・近隣からの実地習得、地域が確定した場合の手習い | 家業の農作業、地域に記録のある手仕事 | 親族・奉公・仕事に伴う移動を資料に応じて | 対象村落、寺子屋等への距離・費用、奉公の範囲 |
| 清代都市 1750–1850 | 私塾・親族・商家内の学びを地域別に確認 | 商家、手仕事、家内労働 | 商業・親族の縁による移動を個別に確認 | 対象都市、性別・立場別の参加条件、試験経路の実際 |
| 北インドの町と周辺 1556–1707 | 家・師・職場などからの学び | 農村の生業、職人、商業、記録にある雇用形態 | 親族・雇用・商いに伴う移動を個別に確認 | 対象地域・宗教・言語・階層ごとの条件と比率 |
| トンブクトゥ交易圏 1400–1591 | 家・師の学び、写本や学問に関わる経路 | 交易、写本に関わる仕事、地域の手仕事 | 川・陸路の商いと親族移動を個別に確認 | 町と周辺の範囲、学問の参加条件、職種人口比 |
| フランスの町と農村 1500–1800 | 家庭・教会・地域の学び、徒弟修業 | 家業、町の職人・商い、雇用 | 奉公・徒弟・家族に伴う移動 | 具体的な町、ギルドや徒弟の時期別条件、学費・契約 |
| 現代日本 2000–基準年 | 家庭・学校・職場・地域の学び | 雇用・自営・無償ケア等 | 進学・就業・家族・避難等 | 地域・年・世帯別の実際のアクセスと比率 |
| 現代中国 2000–基準年 | 同上。制度区分と地域差は国別資料で確定 | 同上 | 同上。地域間移動の条件を確定 | 地域、行政・世帯条件、年次変化 |
| 現代インド 2000–基準年 | 同上。言語・地域・学校種を確定 | 同上 | 同上 | 州、地域、社会的立場、年次変化 |
| 現代マリ 2000–基準年 | 学校・家庭・地域での学びを地域別に確定 | 農業・交易・雇用等を地域別に確定 | 同上 | 地域・時期・安全状況と欠損の扱い |
| 現代フランス 2000–基準年 | 家庭・学校・職場・地域の学び | 雇用・自営・無償ケア等 | 進学・就業・家族等 | 地域・年・世帯別の実際のアクセスと比率 |

現代の行の「同上」は実装で同じ抽選率を使う意味ではない。現代の選択肢は国・地域・年・世帯別の採用データを結び付けてから有効化する。学校以外で身に付ける技能も進歩として記録し、`formal_school_enrolled` が偽でも `learning` と個別 `skill_id` が増え得る。

### 資料の対応と限界

- 東北農村の家族・世帯の調査先：[麗澤大学 Population and Family History Project](https://www.fl.reitaku-u.ac.jp/pfhp/eap/japanese/1.htm)。寺子屋は農村にも存在したという広域の確認：[文部科学省『Education for Commoners』](https://www.mext.go.jp/b_menu/hakusho/html/others/detail/1317227.htm)。前者は対象村落の人口史、後者は日本全体の教育史であり、両者を結んで「その村の誰が通えた」とは推定しない。
- 清代の私塾・親族学校等の経路：[中国人民大学 清史研究所の研究要旨](https://qsyj.ruc.edu.cn/EN/abstract/abstract188.shtml)。商家・手仕事の結社：[International Review of Social History の概説](https://www.cambridge.org/core/journals/international-review-of-social-history/article/chinese-guilds-from-the-seventeenth-to-the-twentieth-centuries-an-overview/61A96EB7FF67CE0BE8073C36DDB049CD)。広域の制度説明にとどまり、選定都市のアクセス条件は未確定。
- ムガル期の職と移動の多様性：[International Review of Social History の労働史研究](https://www.cambridge.org/core/journals/international-review-of-social-history/article/world-of-labour-in-mughal-india-c15001750/5DB14810AF7AA405D1DE44B1A599E4C6)。学習経路の一例：[同誌の会計知識に関する研究](https://www.cambridge.org/core/journals/international-review-of-social-history/article/norms-of-professional-excellence-and-good-conduct-in-accountancy-manuals-of-the-mughal-empire/68EB1D23E5FED0645D25FA622854D0AF)。特定職の記録を全住民の教育として一般化しない。
- トンブクトゥの交易と学問：[米国議会図書館の資料解説](https://www.loc.gov/collections/islamic-manuscripts-from-mali/articles-and-essays/timbuktu-an-islamic-cultural-center/)、[ケープタウン大学の写本事業](https://tombouctoumanuscripts.uct.ac.za/overview/timbuktus-history)。写本文化は存在したが、識字率・就学率はこれらから得られない。
- フランスの徒弟修業：[Cambridge University Press の研究要旨](https://www.cambridge.org/core/books/abs/apprenticeship-in-early-modern-europe/surviving-the-end-of-the-guilds-apprenticeship-in-eighteenth-and-nineteenthcentury-france/33316FFF3D4B41A8AA80CFE2FA56882A)、[旧体制下の別経路に関する研究要旨](https://www.cambridge.org/core/journals/annales-histoire-sciences-sociales/article/abs/lapprentissage-hors-des-corporations-les-formations-professionnelles-alternatives-a-paris-sous-lancien-regime/CB4AC7A8F3EF80ED6359AF9542B2E49F)。いずれも対象期間の一部、特に都市を扱うため、1500–1800年の全国に同じ条件を適用しない。
- 現代5か国の出生・死亡・教育等の系列候補は [国連 WPP](https://www.un.org/development/desa/pd/content/world-population-prospects-2024-dataset)、[World Bank WDI](https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators)。国別集計から個人の入学・就職・転居の確率を直接導かず、各制度と地域の資料を追加する。

上記は史料・研究の**要旨または入口の確認**である。本文の精査、地域適合、再利用条件、年代別の数値化は未完了。引用元の文章をイベント本文へ転載せず、創作原稿と出典の関係を記録する。

## 2. 実行時の機会・資格契約

四半期の開始時に、出生文脈の名称からではなく、その四半期の `current_context_id` から `OpportunityOffer` を生成する。必要な入力は `calendar_quarter`、`location_id`、年齢、世帯・養育者、社会的立場、資源、学習歴、技能、役割を持つ人物、現在の所属・仕事・健康エピソード、採用データ版、乱数状態。地域移動・時代移行後は新しい文脈へ切り替える。

各 offer は少なくとも `id`、`kind`、`context_id`、`valid_from`/`valid_until`、`provider_id`（実在の制度またはゲーム内の人物・世帯）、`eligibility_rules`、`cost_or_resource_rule`、`source_record_ids`、`evidence_tier`（史料確認／資料から推定／ゲーム用仮説）、`uncertainty`、`public_enabled` を持つ。費用や比率が不明な項目は `data/scenario-opportunity-estimates.json` のゲーム用レンジで仮置きできる。個別の機会提供者が未解決ならofferを作らない。推定値の根拠、適用範囲、調整履歴を別記し、実測と表示を区別する。

`eligible = context_enabled ∧ offer_active ∧ person_and_household_rules ∧ age_and_calendar_rules ∧ reachable_provider ∧ resource_rule ∧ state_preconditions ∧ data_record_reviewed`。条件が未定義なら偽。主人公が関われる経路だけを候補にする。条件を満たしても応募・紹介・採用等の結果を別判定にできるが、その確率は値の出典または明示したゲーム用仮説を持つ必要がある。機会が見つからない場合は進学・雇用イベントを強制せず、家・近隣・趣味・関係の小さな選択を優先する。

既存の capability は offer と状態から導出する。

| capability | true にする条件 |
|---|---|
| `literacy_instruction` | 現在の地域・年に到達できる教え手が存在し、学ぶための人物・費用・時間条件を満たす。学校在籍は不要。 |
| `independent_learning` | 本人が自分で行動でき、学習手段と自由時間がある。現代の学校在籍を要求しない。 |
| `craft_learning` | 対象技能、教える人または場所、作業可能な時期・世帯条件がある。 |
| `formal_school_enrolled` | 継続中の所属IDがあり、該当四半期に共同学習の場と仲間がある。私塾・師のもとでの学びを機械的に現代学校扱いしない。 |
| `paid_work_available` | 賃金等の対価がある具体的な仕事・追加仕事 offer があり、年齢・技能・契約・世帯条件を満たす。家業の無償労働と混同しない。 |
| `adult_learning_available` | 成人向けの到達可能な教え手・教材・職場学習があり、時間・資源条件を満たす。 |
| `care_support_available` | 実際に支援できる人物・共同体・制度が存在し、対象人物との関係と時期が合う。 |
| `recording_available` | 記録手段または聞き手が存在する。文字を自力で書けることに限定しない。 |
| `education_offer` | `offer.education` が1件以上生成され、入学・継続の具体的な条件が整う。 |
| `apprenticeship_offer` | `offer.apprenticeship` が1件以上生成され、師・技能・期間・条件が解決する。 |
| `job_offer` | `offer.work` が1件以上生成され、仕事・契約・勤務地が解決する。 |
| `migration_offer` | `offer.migration` が1件以上生成され、出発地・到着地・旅程・資源が解決する。 |
| `mutual_partnership_offer` | 相互意思と相手の継続人物ID、共同生活計画があり、当該文脈の条件を満たす。 |
| `treatment_options_available` | 進行中の病気・傷のエピソードと、利用可能な治療または支援の2案、経過モデルが解決する。 |

`education_transition` の「働く」を選べるのは、同じ四半期に独立の `offer.work` がある場合だけ。ない場合は「進む／見送る」の2択が成り立つなら提示できる。`treatment_decision` は乳幼児なら養育者の選択として記録し、本人の性格形成へ算入しない。

## 3. 大きな決断と継続

`education`, `apprenticeship`, `work`, `migration`, `partnership`, `treatment` の具体IDを、決断提示時に保存する。決断を保留して再開したときは別の offer に差し替えない。期限切れ・人物死亡・到着先変更等が起きた場合は、説明文を出して失効処理し、選択結果を適用しない。機会単位の提示済み／承諾済みIDは人生記録に残し、同じ機会の重複決断を防ぐ。

出生舞台の初期文脈終端は人生終了ではない。`period.to` の翌年から後続 `current_context_id` を定義し、その年に有効な社会状況・制度・機会・死亡率・呼称を読み込む。後続文脈は [scenario-successor-estimates.json](data/scenario-successor-estimates.json) に収録した。現代の出生舞台で基準年を越えた場合も、公表予測の対象期間とその外側のゲーム用仮説を分け、適用根拠を画面とデータに残す。

## 4. 機会データを有効化する条件

1. 歴史的事実を明示する場合は場所・期間・対象社会層が資料と一致することを確認する。ゲーム用推定だけで構成する機会は、推定の適用範囲と表示をレビューする。
2. 統計値が必要な抽選は母集団・年・地域・不確実性・ライセンスを確定する。資料が足りない場合はゲーム用仮説の調整値と明示する。
3. offer ID の参照先（師、制度、相手、場所、職、病状）を作り、選択後の状態遷移と後日談が解決できるようにする。
4. 出生から死亡まで使う後続時代の文脈を用意する。表示内容、歴史的主張、年齢表現を再確認する。

上記を満たした単位から個別に `public_enabled` を有効にする。10シナリオ一括有効化はしない。


## 5. 推定値を使った初期機会・健康モデル

`data/scenario-opportunity-estimates.json` に10シナリオの機会発生レンジと、年齢帯別の短期疾病・けが・慢性状態エピソードの初期レンジを置いた。これらは制作上の仮説であり、歴史上または市域の頻度を表さない。初期レンジからシナリオごとに一つの中央値を選び、データ版に固定して使う。各四半期にレンジを引き直して世界の率を変えない。

機会レンジの単位は「条件を満たす具体的な提供者・場所・時間がある人物に、該当カテゴリのofferを1件以上生成する年確率」であり、入学・採用・移住などを実行する確率ではない。offerの発生前に年齢、場、世帯、人物、費用、既存状態を確認する。治療の意思決定は病状エピソードと実在する支援者を要し、選択結果は別のゲーム用経過モデルで決める。資料がない歴史期に近代医学を登場させない。

最初の試作では、短期疾病の不利益を数値の一律減少だけで表さず、休息・ケア・予定変更などの選択に分ける。慢性状態やけがの確率・回復率・死亡への影響は、この初期レンジから自動推定せず、独立したモデルと不確実性を定義する。シナリオごとの文化・国・階層補正は初期状態で加えない。補正する場合は根拠またはゲーム上の理由、低・中央・高の幅を別レコードとして記録する。

## 6. 後続時代の接続

[data/scenario-successor-estimates.json](data/scenario-successor-estimates.json) に全10シナリオの後続文脈を収録した。歴史資料を使う出生舞台は初期適用期間後の文脈と物語上の表現方針を定義し、現代の出生舞台はWPP予測の終端後もゲーム用仮説として継続する。後続文脈IDは `{scenario_id}:successor:{from_year}-{to_year}` から生成する。後続年への切り替えでは人物・家族・関係・技能・資源・進行中の病状を維持し、次の四半期から有効年に応じて社会状況・制度・機会文脈だけを更新する。大きな政治変化や戦争を全員の経験として一律に適用せず、場所・年齢・職業・世帯条件に合う機会として提示する。

この後続表は人生を遊びとして連続させるための編集用接続案で、網羅的な歴史年表や地域住民全体についての主張ではない。本文・地域適合・ライセンスを確認した資料がある箇所は、その資料に応じて更新し、データの空白は推定と表示する。