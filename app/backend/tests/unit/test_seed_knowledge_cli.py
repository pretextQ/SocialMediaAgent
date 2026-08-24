"""seed-knowledge CLI 测试（TDD，P5.5.4）。"""

from socialmedia_agent.cli.seed_knowledge import main


def test_seed_knowledge_cli_writes_persistent_store(tmp_path):
    seed_file = tmp_path / "seed.md"
    seed_file.write_text(
        "## 标题写作方法\n开头3秒钩子 + 数字 + 情绪词。\n\n## 选题方向\nAI 工具测评是高互动选题。\n",
        encoding="utf-8",
    )
    store_path = tmp_path / "knowledge" / "knowledge.index"

    code = main(["--input", str(seed_file), "--store", str(store_path)])
    assert code == 0
    assert store_path.exists()
    assert (tmp_path / "knowledge" / "knowledge.json").exists()


def test_seed_knowledge_cli_no_docs_returns_error(tmp_path):
    seed_file = tmp_path / "empty.md"
    seed_file.write_text("## 只有标题\n", encoding="utf-8")
    code = main(["--input", str(seed_file), "--store", str(tmp_path / "k.index")])
    assert code == 1
