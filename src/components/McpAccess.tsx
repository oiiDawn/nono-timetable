/** Show OAuth consent and allow the owner to revoke individual agent connections. */
import { useEffect, useState } from "react";
import { Button, Card, Modal } from "@heroui/react";
import {
  decideOAuthRequest,
  getMcpConnections,
  getOAuthRequest,
  revokeMcpConnection,
  type McpConnection,
} from "@/lib/api";

export function OAuthConsent({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<{ clientName: string; redirectUri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void getOAuthRequest(requestId)
      .then((value) => {
        if (active) setRequest(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "授权申请加载失败");
      });
    return () => {
      active = false;
    };
  }, [requestId]);
  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await decideOAuthRequest(requestId, approve);
      window.location.assign(result.redirectUri);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "授权失败，请重试");
      setBusy(false);
    }
  };
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <Card.Header>
          <Card.Title>连接课表</Card.Title>
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          {request ? (
            <>
              <p>
                <strong className="break-words">{request.clientName}</strong> 请求访问你的课表。
              </p>
              <p>允许查询、新增、修改和删除课程，包括重复课程；允许读取学生姓名、地点和备注。</p>
              <p className="text-sm text-muted">
                授权长期有效，退出网站不会断开连接。你可以随时在“MCP 授权”中撤销。
              </p>
              <p className="text-sm break-all text-muted">返回地址：{request.redirectUri}</p>
            </>
          ) : !error ? (
            <p role="status">正在加载授权申请…</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-danger">
              {error}
            </p>
          ) : null}
        </Card.Content>
        <Card.Footer className="justify-end gap-2">
          {!request && error ? (
            <Button variant="secondary" onPress={() => window.location.assign("/")}>
              返回课表
            </Button>
          ) : null}
          <Button
            variant="secondary"
            isDisabled={busy || !request}
            onPress={() => void decide(false)}
          >
            拒绝
          </Button>
          <Button isDisabled={busy || !request} onPress={() => void decide(true)}>
            {busy ? "正在处理…" : "允许连接"}
          </Button>
        </Card.Footer>
      </Card>
    </main>
  );
}

export function McpConnections({ onClose }: { onClose: () => void }) {
  const [connections, setConnections] = useState<McpConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getMcpConnections()
      .then((value) => {
        if (active) setConnections(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "授权加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await revokeMcpConnection(id);
      setConnections((current) => current.filter((connection) => connection.id !== id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "撤销失败，请重试");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!busy}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-lg">
          <Modal.Header>
            <Modal.Heading>MCP 授权</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              授权长期有效。撤销后，该连接立即停止访问课表；重新连接需再次授权。
            </p>
            {error ? (
              <p role="alert" className="text-danger">
                {error}
              </p>
            ) : null}
            {loading ? (
              <p role="status">正在加载…</p>
            ) : connections.length === 0 ? (
              <p>暂无有效授权。</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {connections.map((connection) => (
                  <li
                    key={connection.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-default p-3"
                  >
                    <div className="min-w-0">
                      <p className="break-words">{connection.name || "MCP 客户端"}</p>
                      <p className="text-sm text-muted">
                        {new Date(connection.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="danger-soft"
                      isDisabled={busy}
                      onPress={() => void revoke(connection.id)}
                    >
                      撤销
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" isDisabled={busy} onPress={onClose}>
              关闭
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
