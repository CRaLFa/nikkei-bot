SYSTEMD_DIR := /etc/systemd/system

.PHONY: install uninstall

install:
	@ install -t $(SYSTEMD_DIR) -m 644 ./nikkei-bot.service
	@ systemctl daemon-reload
	@ systemctl enable --now nikkei-bot.service
	@ echo 'Installation completed.'

uninstall:
	@ systemctl disable --now nikkei-bot.service
	@ $(RM) $(SYSTEMD_DIR)/nikkei-bot.service
	@ systemctl daemon-reload
	@ echo 'Uninstallation completed.'
