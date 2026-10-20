package main

import (
	"fmt"
	"net"
	"sort"
)

// Print usable URLs for every startup entry point, including npm start and logs.
func printAddresses(host, port string) {
	fmt.Printf("监听地址：%s\n", net.JoinHostPort(host, port))
	wildcard := host == "0.0.0.0" || host == "::" || host == ""
	if !wildcard {
		fmt.Printf("访问地址：http://%s\n", net.JoinHostPort(host, port))
		if ip := net.ParseIP(host); host == "localhost" || ip != nil && ip.IsLoopback() {
			fmt.Println("局域网访问：未开启（仅监听本机）。运行 make lan，或设置 HOST=0.0.0.0 后启动。")
		} else {
			fmt.Printf("局域网访问：http://%s（需同一网络下可达）\n", net.JoinHostPort(host, port))
		}
		return
	}
	local := "127.0.0.1"
	if host == "::" {
		local = "::1"
	}
	fmt.Printf("本机访问：http://%s\n", net.JoinHostPort(local, port))
	interfaces, err := net.Interfaces()
	if err != nil {
		fmt.Printf("局域网地址识别失败：%v，请检查网卡连接。\n", err)
		return
	}
	type address struct{ ip, name string }
	var addresses []address
	seen := map[string]bool{}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ip, _, err := net.ParseCIDR(addr.String())
			if err != nil || ip.IsLoopback() || ip.IsUnspecified() || ip.IsLinkLocalUnicast() {
				continue
			}
			// IPv4 listeners cannot serve IPv6 URLs; include IPv6 for :: only.
			if ip.To4() == nil && host != "::" {
				continue
			}
			if !seen[ip.String()] {
				seen[ip.String()] = true
				addresses = append(addresses, address{ip.String(), iface.Name})
			}
		}
	}
	sort.SliceStable(addresses, func(i, j int) bool {
		a, b := net.ParseIP(addresses[i].ip).IsPrivate(), net.ParseIP(addresses[j].ip).IsPrivate()
		if a != b {
			return a
		}
		return addresses[i].ip < addresses[j].ip
	})
	if len(addresses) == 0 {
		fmt.Println("未检测到局域网地址，请连接 Wi-Fi 或有线网络后重启。")
	}
	for _, addr := range addresses {
		fmt.Printf("局域网访问：http://%s（%s）\n", net.JoinHostPort(addr.ip, port), addr.name)
	}
}
