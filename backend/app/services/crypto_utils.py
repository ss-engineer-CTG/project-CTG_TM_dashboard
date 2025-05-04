"""
データ暗号化/復号化ユーティリティ
- CSVやJSONファイルの暗号化/復号化機能を提供
- 設定ファイルの保護に使用
"""

import os
import base64
import json
import logging
import hashlib
from pathlib import Path
from typing import Union, Dict, Any, List, Optional

# 標準ライブラリのみで実装するための暗号化モジュール
try:
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False

# ロガー設定
logger = logging.getLogger(__name__)

# アプリケーション固有の暗号化キー（本番環境ではより安全な方法で管理）
# 実際の実装ではハードコードせず、環境変数や安全なキーストアから取得
DEFAULT_ENCRYPTION_KEY = "THIS_IS_A_DEVELOPMENT_KEY_REPLACE_IN_PRODUCTION"
DEFAULT_SALT = b"project_dashboard_salt"

class CryptoUtils:
    """データの暗号化と復号化を行うユーティリティクラス"""
    
    def __init__(self, key: Optional[str] = None, salt: Optional[bytes] = None):
        """
        暗号化ユーティリティを初期化
        
        Args:
            key: 暗号化キー（指定がない場合はデフォルト値を使用）
            salt: ソルト値（指定がない場合はデフォルト値を使用）
        """
        self.key = key or DEFAULT_ENCRYPTION_KEY
        self.salt = salt or DEFAULT_SALT
        self.fernet = self._generate_fernet() if CRYPTO_AVAILABLE else None
        
        if not CRYPTO_AVAILABLE:
            logger.warning("cryptographyモジュールが利用できません。基本的な暗号化を使用します。")
    
    def _generate_fernet(self) -> 'Fernet':
        """Fernetオブジェクトを生成"""
        if not CRYPTO_AVAILABLE:
            return None
            
        # キーをバイトに変換
        key_bytes = self.key.encode()
        
        # PBKDF2を使用してキーを導出
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=self.salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(key_bytes))
        
        return Fernet(key)
    
    def encrypt_data(self, data: bytes) -> bytes:
        """データを暗号化"""
        if CRYPTO_AVAILABLE and self.fernet:
            return self.fernet.encrypt(data)
        else:
            # 暗号化ライブラリがない場合の簡易実装（本番環境では使用しないこと）
            key_hash = hashlib.sha256(self.key.encode()).digest()
            encrypted = bytearray()
            for i, b in enumerate(data):
                key_byte = key_hash[i % len(key_hash)]
                encrypted.append((b + key_byte) % 256)
            return bytes(encrypted)
    
    def decrypt_data(self, encrypted_data: bytes) -> bytes:
        """暗号化されたデータを復号化"""
        if CRYPTO_AVAILABLE and self.fernet:
            return self.fernet.decrypt(encrypted_data)
        else:
            # 暗号化ライブラリがない場合の簡易実装（本番環境では使用しないこと）
            key_hash = hashlib.sha256(self.key.encode()).digest()
            decrypted = bytearray()
            for i, b in enumerate(encrypted_data):
                key_byte = key_hash[i % len(key_hash)]
                decrypted.append((b - key_byte) % 256)
            return bytes(decrypted)
    
    def encrypt_file(self, input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> Path:
        """
        ファイルを暗号化
        
        Args:
            input_path: 暗号化するファイルのパス
            output_path: 暗号化したファイルの出力パス（指定がない場合は.encを追加）
            
        Returns:
            暗号化されたファイルのパス
        """
        input_path = Path(input_path)
        
        if not output_path:
            output_path = input_path.with_suffix(input_path.suffix + '.enc')
        else:
            output_path = Path(output_path)
        
        try:
            with open(input_path, 'rb') as file:
                data = file.read()
            
            encrypted_data = self.encrypt_data(data)
            
            with open(output_path, 'wb') as file:
                file.write(encrypted_data)
            
            logger.info(f"ファイルを暗号化しました: {input_path} -> {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"ファイル暗号化エラー: {str(e)}")
            raise
    
    def decrypt_file(self, input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> Path:
        """
        暗号化されたファイルを復号化
        
        Args:
            input_path: 復号化するファイルのパス
            output_path: 復号化したファイルの出力パス（指定がない場合は自動生成）
            
        Returns:
            復号化されたファイルのパス
        """
        input_path = Path(input_path)
        
        if not output_path:
            # .encという拡張子があれば削除、なければ.decを追加
            suffix = input_path.suffix
            if suffix == '.enc':
                base_name = input_path.stem
                if '.' in base_name:
                    output_path = input_path.with_name(base_name)
                else:
                    output_path = input_path.with_suffix('')
            else:
                output_path = input_path.with_suffix(suffix + '.dec')
        else:
            output_path = Path(output_path)
        
        try:
            with open(input_path, 'rb') as file:
                encrypted_data = file.read()
            
            decrypted_data = self.decrypt_data(encrypted_data)
            
            with open(output_path, 'wb') as file:
                file.write(decrypted_data)
            
            logger.info(f"ファイルを復号化しました: {input_path} -> {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"ファイル復号化エラー: {str(e)}")
            raise
    
    def encrypt_csv(self, input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> Path:
        """CSVファイルを暗号化"""
        return self.encrypt_file(input_path, output_path)
    
    def decrypt_csv(self, input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> Path:
        """暗号化されたCSVファイルを復号化"""
        return self.decrypt_file(input_path, output_path)
    
    def encrypt_json(self, data: Dict[str, Any], output_path: Union[str, Path]) -> Path:
        """
        JSON形式のデータを暗号化してファイルに保存
        
        Args:
            data: 暗号化するJSONデータ
            output_path: 出力ファイルパス
            
        Returns:
            暗号化されたファイルのパス
        """
        json_data = json.dumps(data).encode('utf-8')
        encrypted_data = self.encrypt_data(json_data)
        
        output_path = Path(output_path)
        with open(output_path, 'wb') as file:
            file.write(encrypted_data)
        
        logger.info(f"JSONデータを暗号化しました: {output_path}")
        return output_path
    
    def decrypt_json(self, input_path: Union[str, Path]) -> Dict[str, Any]:
        """
        暗号化されたJSONファイルを復号化
        
        Args:
            input_path: 復号化するファイルのパス
            
        Returns:
            復号化されたJSONデータ
        """
        input_path = Path(input_path)
        
        with open(input_path, 'rb') as file:
            encrypted_data = file.read()
        
        decrypted_data = self.decrypt_data(encrypted_data)
        json_data = json.loads(decrypted_data.decode('utf-8'))
        
        logger.info(f"JSONファイルを復号化しました: {input_path}")
        return json_data


# シングルトンインスタンスを作成
_crypto_instance = None

def get_crypto_instance() -> CryptoUtils:
    """CryptoUtilsのシングルトンインスタンスを取得"""
    global _crypto_instance
    if _crypto_instance is None:
        # 環境変数から暗号化キーを取得（設定されていなければデフォルト値を使用）
        key = os.environ.get('CRYPTO_KEY', DEFAULT_ENCRYPTION_KEY)
        _crypto_instance = CryptoUtils(key=key)
    return _crypto_instance


# ユーティリティ関数
def encrypt_file(input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> Path:
    """ファイルを暗号化するユーティリティ関数"""
    crypto = get_crypto_instance()
    return crypto.encrypt_file(input_path, output_path)

def decrypt_file(input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> Path:
    """ファイルを復号化するユーティリティ関数"""
    crypto = get_crypto_instance()
    return crypto.decrypt_file(input_path, output_path)

def encrypt_csv(input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> Path:
    """CSVファイルを暗号化するユーティリティ関数"""
    crypto = get_crypto_instance()
    return crypto.encrypt_csv(input_path, output_path)

def decrypt_csv(input_path: Union[str, Path], output_path: Optional[Union[str, Path]] = None) -> Path:
    """CSVファイルを復号化するユーティリティ関数"""
    crypto = get_crypto_instance()
    return crypto.decrypt_csv(input_path, output_path)

def encrypt_json(data: Dict[str, Any], output_path: Union[str, Path]) -> Path:
    """JSONデータを暗号化するユーティリティ関数"""
    crypto = get_crypto_instance()
    return crypto.encrypt_json(data, output_path)

def decrypt_json(input_path: Union[str, Path]) -> Dict[str, Any]:
    """JSONファイルを復号化するユーティリティ関数"""
    crypto = get_crypto_instance()
    return crypto.decrypt_json(input_path)