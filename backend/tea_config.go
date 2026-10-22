package backend

import (
	_ "embed"
	"encoding/json"
)

//go:embed tea-workers.json
var teaWorkersJSON []byte

var teaWorkerTemplates = func() []TeaWorker {
	var workers []TeaWorker
	if err := json.Unmarshal(teaWorkersJSON, &workers); err != nil {
		panic("tea-workers.json 解析失败: " + err.Error())
	}
	return workers
}()

// teaFixtures 返回模板副本，避免调用方修改共享配置。
func teaFixtures() []TeaWorker {
	out := make([]TeaWorker, len(teaWorkerTemplates))
	copy(out, teaWorkerTemplates)
	return out
}
